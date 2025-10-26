import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import type { Env } from '@/types';
import { getDb, games } from '@/lib/db';
import { requireAdmin } from '@/middleware/auth';
import {
  searchBGGGames,
  getBGGGameDetails,
  downloadImage,
  extractBGGId,
} from '@/lib/services/bgg';
import { generateSlug } from '@/lib/utils/slug';

const bggRouter = new Hono<{ Bindings: Env }>();

// Search BGG games
bggRouter.get(
  '/search',
  requireAdmin,
  zValidator(
    'query',
    z.object({
      q: z.string().min(2, 'Query must be at least 2 characters'),
    })
  ),
  async (c) => {
    const { q } = c.req.valid('query');

    try {
      // Disable thumbnail fetching for now - it's too slow with rate limiting
      const results = await searchBGGGames(q, c.env.DB, c.env.RATE_LIMIT_KV, {
        fetchThumbnails: false,
      });

      // Check which games are already imported
      const bggIds = results.map((r) => r.id).filter(Boolean);
      const db = getDb(c.env.DB);

      const importedGamesMap = new Map<string, { id: string; imageUrl: string | null }>();
      if (bggIds.length > 0) {
        const existingGames = await db
          .select({ id: games.id, bggId: games.bggId, imageUrl: games.imageUrl })
          .from(games)
          .where(inArray(games.bggId, bggIds));

        for (const g of existingGames) {
          if (g.bggId) {
            importedGamesMap.set(g.bggId, { id: g.id, imageUrl: g.imageUrl });
          }
        }
      }

      // Add isImported flag, gameId, and gameImageUrl to results
      const resultsWithStatus = results.map((game) => {
        const importedGame = importedGamesMap.get(game.id);
        return {
          ...game,
          isImported: !!importedGame,
          gameId: importedGame?.id || null,
          gameImageUrl: importedGame?.imageUrl || null,
        };
      });

      return c.json(resultsWithStatus);
    } catch (error) {
      console.error('BGG search failed:', error);
      return c.json({ error: 'Failed to search BoardGameGeek' }, 500);
    }
  }
);

// Get BGG game details
bggRouter.get(
  '/games/:bggId',
  requireAdmin,
  async (c) => {
    const { bggId } = c.req.param();

    try {
      const details = await getBGGGameDetails(
        bggId,
        c.env.DB,
        c.env.RATE_LIMIT_KV
      );

      return c.json(details);
    } catch (error) {
      console.error('Failed to fetch BGG game details:', error);
      return c.json({ error: 'Failed to fetch game from BoardGameGeek' }, 500);
    }
  }
);

// Import game from BGG (fetches data, downloads image, creates game)
bggRouter.post(
  '/games/:bggId/import',
  requireAdmin,
  async (c) => {
    const { bggId } = c.req.param();
    let uploadedImageUrl: string | null = null;

    try {
      // Fetch game details from BGG
      const details = await getBGGGameDetails(
        bggId,
        c.env.DB,
        c.env.RATE_LIMIT_KV
      );

      // Download and upload image if available
      if (details.imageUrl) {
        try {
          const imageBuffer = await downloadImage(details.imageUrl);

          // Detect image type from buffer
          let extension = 'jpg';
          let contentType = 'image/jpeg';

          // Check magic bytes to determine actual format
          if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
            extension = 'png';
            contentType = 'image/png';
          } else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) {
            extension = 'gif';
            contentType = 'image/gif';
          } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) {
            extension = 'webp';
            contentType = 'image/webp';
          }

          // Upload to R2
          // Note: Unlike Next.js version, we don't convert to WebP since Sharp doesn't work
          // Images are stored as-is from BGG with auto-detected format
          const key = `games/game-${bggId}.${extension}`;
          await c.env.FILES.put(key, imageBuffer, {
            httpMetadata: {
              contentType,
            },
          });

          uploadedImageUrl = `/uploads/${key}`;
        } catch (imageError) {
          console.error('BGG image processing failed:', imageError);
          // Continue without image - user can upload manually
        }
      }

      // Create the game with BGG data
      const db = getDb(c.env.DB);
      const year = details.yearPublished || null;
      const slug = generateSlug(details.name, year);

      const [game] = await db
        .insert(games)
        .values({
          name: details.name,
          year,
          slug,
          imageUrl: uploadedImageUrl,
          bggId, // Store BGG ID for tracking imported games
          bggUrl: `https://boardgamegeek.com/boardgame/${bggId}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Convert Date objects to timestamps for JSON serialization
      // D1 stores timestamps as integers, and the schema expects numbers
      const gameResponse = {
        ...game,
        createdAt: game.createdAt ? new Date(game.createdAt).getTime() : Date.now(),
        updatedAt: game.updatedAt ? new Date(game.updatedAt).getTime() : Date.now(),
      };

      return c.json(gameResponse, 201);
    } catch (error) {
      // Clean up uploaded image if game creation failed
      if (uploadedImageUrl) {
        try {
          // Extract key from URL (/uploads/games/game-123.jpg -> games/game-123.jpg)
          const key = uploadedImageUrl.replace('/uploads/', '');
          await c.env.FILES.delete(key);
        } catch (cleanupError) {
          console.error('Failed to cleanup image after error:', cleanupError);
        }
      }

      console.error('Failed to create game from BGG:', error);

      // Check if it's a duplicate error
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        if (error.message.includes('slug')) {
          return c.json({ error: 'A game with this name and year already exists' }, 409);
        }
        return c.json({ error: 'This game has already been imported' }, 409);
      }

      // Return more specific error message if available
      if (error instanceof Error) {
        return c.json({ error: error.message || 'Failed to create game from BoardGameGeek' }, 500);
      }

      return c.json({ error: 'Failed to create game from BoardGameGeek' }, 500);
    }
  }
);

// Helper endpoint to extract BGG ID from URL
bggRouter.get(
  '/extract-id',
  requireAdmin,
  zValidator(
    'query',
    z.object({
      url: z.string().url(),
    })
  ),
  async (c) => {
    const { url } = c.req.valid('query');
    const bggId = extractBGGId(url);

    if (!bggId) {
      return c.json({ error: 'Invalid BGG URL' }, 400);
    }

    return c.json({ bggId });
  }
);

export default bggRouter;
