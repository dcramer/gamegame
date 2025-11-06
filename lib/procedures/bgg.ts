/**
 * BoardGameGeek (BGG) Procedures
 * oRPC procedures for BGG integration
 */

import { z } from 'zod';
import { ORPCError } from '@orpc/server';
import { adminProcedure } from './base';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { searchBGGGames, getBGGGameDetails, downloadImage } from '@/lib/services/bgg';
import { nanoid } from 'nanoid';
import { uploadBlob, blobKeyToUrl, bulkDelete } from '@/lib/services/blob-storage';
import { bggGameSchema, gameResponseSchema } from '@/lib/api/schemas';

function generateSlug(name: string, year?: number | null): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return year ? `${slug}-${year}` : slug;
}

/**
 * Search BGG for games (admin only, rate limited by middleware)
 */
export const search = adminProcedure
  .route({
    method: 'GET',
    path: '/bgg/search',
  })
  .input(
    z.object({
      query: z.string().min(2, 'Query must be at least 2 characters'),
    })
  )
  .output(
    z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        yearPublished: z.number().nullable(),
        isImported: z.boolean(),
        gameId: z.string().nullable(),
        gameImageUrl: z.string().nullable(),
      })
    )
  )
  .handler(async ({ input }) => {
    // Check if BGG API key is configured
    if (!process.env.BGG_API_KEY) {
      console.warn('BGG_API_KEY not configured, BGG search unavailable');
      throw new ORPCError({
        code: 'UNAVAILABLE',
        message: 'BoardGameGeek API key is not configured',
      });
    }

    // Search BGG (always fetches fresh results from BGG API)
    const results = await searchBGGGames(input.query, {
      fetchThumbnails: false,
      apiKey: process.env.BGG_API_KEY,
    });

    // Check which games are already imported
    const bggIds = results.map((r) => r.id).filter(Boolean);
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

    return resultsWithStatus;
  });

/**
 * Get game details from BGG (admin only, rate limited)
 */
export const getGame = adminProcedure
  .route({
    method: 'GET',
    path: '/bgg/games/{bggId}',
  })
  .input(
    z.object({
      bggId: z.string(),
    })
  )
  .output(bggGameSchema)
  .handler(async ({ input }) => {
    // Check if BGG API key is configured
    if (!process.env.BGG_API_KEY) {
      throw new ORPCError({
        code: 'UNAVAILABLE',
        message: 'BoardGameGeek API key is not configured',
      });
    }

    const details = await getBGGGameDetails(input.bggId, {
      apiKey: process.env.BGG_API_KEY,
    });

    return details;
  });

/**
 * Import game from BGG (admin only, rate limited)
 */
export const importGame = adminProcedure
  .route({
    method: 'POST',
    path: '/bgg/games/{bggId}/import',
  })
  .input(
    z.object({
      bggId: z.string(),
    })
  )
  .output(gameResponseSchema)
  .handler(async ({ input }) => {
    let uploadedImageKey: string | null = null;

    try {
      // Check if BGG API key is configured
      if (!process.env.BGG_API_KEY) {
        throw new ORPCError({
          code: 'UNAVAILABLE',
          message: 'BoardGameGeek API key is not configured',
        });
      }

      // Fetch game details from BGG
      const details = await getBGGGameDetails(input.bggId, {
        apiKey: process.env.BGG_API_KEY,
      });

      // Download and upload image if available
      let imageUrl: string | null = null;
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

          // Upload to blob storage
          uploadedImageKey = `games/${nanoid()}.${extension}`;
          await uploadBlob(uploadedImageKey, imageBuffer, contentType);
          imageUrl = blobKeyToUrl(uploadedImageKey);
        } catch (error) {
          console.error('Failed to download/upload image:', error);
          // Continue without image
        }
      }

      // Check if game with this BGG ID already exists
      const [existingGame] = await db
        .select({ id: games.id })
        .from(games)
        .where(eq(games.bggId, input.bggId))
        .limit(1);

      if (existingGame) {
        throw new ORPCError({
          code: 'CONFLICT',
          message: 'Game already imported from BoardGameGeek',
        });
      }

      // Generate slug
      const slug = generateSlug(details.name, details.year);

      // Create game
      const [game] = await db
        .insert(games)
        .values({
          id: nanoid(),
          name: details.name,
          slug,
          year: details.year,
          imageUrl,
          bggId: input.bggId,
          bggUrl: `https://boardgamegeek.com/boardgame/${input.bggId}`,
        })
        .returning();

      return game;
    } catch (error) {
      // Clean up uploaded image if game creation failed
      if (uploadedImageKey) {
        try {
          await bulkDelete([uploadedImageKey]);
        } catch (cleanupError) {
          console.error('Failed to clean up uploaded image:', cleanupError);
        }
      }

      throw error;
    }
  });
