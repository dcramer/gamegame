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
      throw new ORPCError('UNAVAILABLE', {
        message: 'BoardGameGeek API key is not configured',
      });
    }

    // Search BGG (always fetches fresh results from BGG API)
    const results = await searchBGGGames(input.query, {
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
      throw new ORPCError('UNAVAILABLE', {
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
    // Check if BGG API key is configured
    if (!process.env.BGG_API_KEY) {
      throw new ORPCError('UNAVAILABLE', {
        message: 'BoardGameGeek API key is not configured',
      });
    }

    // Fetch game details from BGG
    const details = await getBGGGameDetails(input.bggId, {
      apiKey: process.env.BGG_API_KEY,
    });

    // Check if game with this BGG ID already exists
    const [existingGame] = await db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.bggId, input.bggId))
      .limit(1);

    if (existingGame) {
      throw new ORPCError('CONFLICT', {
        message: 'Game already imported from BoardGameGeek',
      });
    }

    // Generate slug
    const slug = generateSlug(details.name, details.yearPublished);

    // Create game immediately without image for fast response
    const [game] = await db
      .insert(games)
      .values({
        id: nanoid(),
        name: details.name,
        slug,
        year: details.yearPublished,
        imageUrl: null, // Will be updated async
        bggId: input.bggId,
        bggUrl: `https://boardgamegeek.com/boardgame/${input.bggId}`,
      })
      .returning();

    // Process image asynchronously after returning response
    // This runs in the background without blocking the response
    if (details.imageUrl) {
      Promise.resolve()
        .then(async () => {
          try {
            console.log(`[BGG Import] Starting async image processing for game ${game.id}`);
            const imageBuffer = await downloadImage(details.imageUrl!);

            // Detect image type from buffer
            let extension = 'webp'; // Default to webp since downloadImage converts to it
            let contentType = 'image/webp';

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
            const uploadedImageKey = `games/${nanoid()}.${extension}`;
            await uploadBlob(uploadedImageKey, imageBuffer, contentType);
            const imageUrl = blobKeyToUrl(uploadedImageKey);

            // Update game with image URL
            await db.update(games).set({ imageUrl }).where(eq(games.id, game.id));

            console.log(`[BGG Import] Image processed successfully for game ${game.id}`);
          } catch (error) {
            console.error(`[BGG Import] Failed to process image for game ${game.id}:`, error);
            // Image processing failed, but game was already created successfully
            // User can upload image manually later
          }
        })
        .catch((error) => {
          // Catch any promise rejection to prevent unhandled rejection warnings
          console.error(`[BGG Import] Async image processing error for game ${game.id}:`, error);
        });
    }

    return game;
  });
