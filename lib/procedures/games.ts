/**
 * Games Procedures
 * oRPC procedures for game-related operations
 */

import { z } from 'zod';
import { ORPCError } from '@orpc/server';
import { publicProcedure, adminProcedure } from './base';
import { db } from '@/lib/db';
import { games, resources, attachments } from '@/lib/db/schema';
import { eq, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  createGameSchema,
  updateGameSchema,
  gameListResponseSchema,
  gameResponseSchema,
  successResponseSchema,
  type GameResponse,
} from '@/lib/api/schemas';
import { generateSlug } from '@/lib/api/helpers';

/**
 * List all games with resource counts
 */
export const list = publicProcedure
  .route({
    method: 'GET',
    path: '/games',
  })
  .output(z.array(gameResponseSchema.extend({ hasResources: z.boolean() })))
  .handler(async () => {
  const gamesList = await db
    .select({
      id: games.id,
      name: games.name,
      year: games.year,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggId: games.bggId,
      bggUrl: games.bggUrl,
      resourceCount: sql<number>`COUNT(DISTINCT ${resources.id})`.mapWith(Number),
      createdAt: games.createdAt,
      updatedAt: games.updatedAt,
    })
    .from(games)
    .leftJoin(resources, eq(games.id, resources.gameId))
    .groupBy(games.id)
    .orderBy(games.name);

  // Map to include hasResources boolean for UI compatibility
  return gamesList.map(game => ({
    ...game,
    hasResources: game.resourceCount > 0,
  }));
});

/**
 * Get single game by ID or slug
 */
export const get = publicProcedure
  .route({
    method: 'GET',
    path: '/games/{idOrSlug}',
  })
  .input(
    z.object({
      idOrSlug: z.string(),
    })
  )
  .output(gameResponseSchema.extend({ resourceCount: z.number() }))
  .handler(async ({ input }) => {
    const [game] = await db
      .select({
        id: games.id,
        name: games.name,
        year: games.year,
        slug: games.slug,
        imageUrl: games.imageUrl,
        bggId: games.bggId,
        bggUrl: games.bggUrl,
        createdAt: games.createdAt,
        updatedAt: games.updatedAt,
      })
      .from(games)
      .where(or(eq(games.slug, input.idOrSlug), eq(games.id, input.idOrSlug)))
      .limit(1);

    if (!game) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Game not found',
      });
    }

    // Get resource count
    const resourceCount = await db
      .select({ count: resources.id })
      .from(resources)
      .where(eq(resources.gameId, game.id));

    return {
      ...game,
      resourceCount: resourceCount.length,
    };
  });

/**
 * Create new game (admin only)
 */
export const create = adminProcedure
  .route({
    method: 'POST',
    path: '/games',
  })
  .input(createGameSchema)
  .output(gameResponseSchema)
  .handler(async ({ input }) => {
    // Generate slug from name (include year when provided)
    const slug = generateSlug(input.name, input.year ?? null);

    // Extract BGG ID from URL if provided
    let bggId: string | null = null;
    if (input.bggUrl) {
      const match = input.bggUrl.match(/\/boardgame\/(\d+)/);
      if (match) {
        bggId = match[1];
      }
    }

    const gameId = nanoid();

    await db.insert(games).values({
      id: gameId,
      name: input.name,
      year: input.year ?? null,
      slug,
      imageUrl: input.imageUrl ?? null,
      bggId,
      bggUrl: input.bggUrl ?? null,
    });

    const [newGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    return newGame;
  });

/**
 * Update game (admin only)
 */
export const update = adminProcedure
  .route({
    method: 'PATCH',
    path: '/games/{id}',
  })
  .input(
    z.object({
      id: z.string(),
      data: updateGameSchema,
    })
  )
  .output(gameResponseSchema)
  .handler(async ({ input }) => {
    // Check if game exists
    const [existingGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, input.id))
      .limit(1);

    if (!existingGame) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Game not found',
      });
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: Date.now(),
    };

    if (input.data.name !== undefined) {
      updateData.name = input.data.name;
    }
    if (input.data.year !== undefined) {
      updateData.year = input.data.year;
    }
    if (input.data.name !== undefined || input.data.year !== undefined) {
      const nextName = input.data.name ?? existingGame.name;
      const nextYear =
        input.data.year !== undefined ? input.data.year : existingGame.year;
      updateData.slug = generateSlug(nextName, nextYear);
    }
    if (input.data.imageUrl !== undefined) updateData.imageUrl = input.data.imageUrl;
    if (input.data.bggUrl !== undefined) {
      updateData.bggUrl = input.data.bggUrl;
      // Extract BGG ID from URL
      if (input.data.bggUrl) {
        const match = input.data.bggUrl.match(/\/boardgame\/(\d+)/);
        if (match) {
          updateData.bggId = match[1];
        }
      } else {
        updateData.bggId = null;
      }
    }

    await db.update(games).set(updateData).where(eq(games.id, input.id));

    const [updatedGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, input.id))
      .limit(1);

    return updatedGame;
  });

/**
 * Delete game and all associated data (admin only)
 */
export const deleteGame = adminProcedure
  .route({
    method: 'DELETE',
    path: '/games/{id}',
  })
  .input(
    z.object({
      id: z.string(),
    })
  )
  .output(successResponseSchema.extend({ deletedResources: z.number(), message: z.string() }))
  .handler(async ({ input }) => {
    // Check if game exists
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, input.id))
      .limit(1);

    if (!game) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Game not found',
      });
    }

    // Count resources for reporting before deletion
    const gameResources = await db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.gameId, game.id));

    const resourceCount = gameResources.length;

    // Collect attachment blob keys for cleanup before deletion
    const gameAttachments = await db
      .select({ blobKey: attachments.blobKey })
      .from(attachments)
      .where(eq(attachments.gameId, game.id));

    // Delete the game - database cascades will handle resources, fragments, embeddings, and attachments
    // Foreign key cascade order (defined in schema):
    // 1. resources.gameId → cascade deletes resources
    // 2. fragments.gameId → cascade deletes fragments
    // 3. fragments.resourceId → cascade deletes fragments
    // 4. embeddings.fragmentId → cascade deletes embeddings
    // 5. embeddings.gameId → cascade deletes embeddings
    // 6. attachments.gameId → cascade deletes attachments
    await db.delete(games).where(eq(games.id, game.id));

    // Clean up blob storage after database deletion
    if (gameAttachments.length > 0) {
      const keys = gameAttachments.map((a) => a.blobKey).filter((k): k is string => !!k);
      if (keys.length > 0) {
        try {
          const { bulkDelete } = await import('@/lib/services/blob-storage');
          await bulkDelete(keys);
        } catch (error) {
          // Log but don't fail the request - orphaned blobs can be cleaned up later
          console.warn(`[deleteGame] Failed to delete ${keys.length} blob files:`, error);
        }
      }
    }

    return {
      success: true,
      deletedResources: resourceCount,
      message: `Game "${game.name}" and ${resourceCount} resources deleted`,
    };
  });
