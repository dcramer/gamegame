/**
 * Games Procedures
 * oRPC procedures for game-related operations
 */

import { z } from 'zod';
import { ORPCError } from '@orpc/server';
import { publicProcedure, adminProcedure } from './base';
import { db } from '@/lib/db';
import { games, resources, fragments, attachments, embeddings } from '@/lib/db/schema';
import { eq, or, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  createGameSchema,
  updateGameSchema,
  type GameResponse,
} from '@/lib/api/schemas';

/**
 * List all games with resource counts
 */
export const list = publicProcedure.handler(async () => {
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

  return gamesList;
});

/**
 * Get single game by ID or slug
 */
export const get = publicProcedure
  .input(
    z.object({
      idOrSlug: z.string(),
    })
  )
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
      throw new ORPCError({
        code: 'NOT_FOUND',
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
  .input(createGameSchema)
  .handler(async ({ input }) => {
    // Generate slug from name
    const slug = generateSlug(input.name);

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
  .input(
    z.object({
      id: z.string(),
      data: updateGameSchema,
    })
  )
  .handler(async ({ input }) => {
    // Check if game exists
    const [existingGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, input.id))
      .limit(1);

    if (!existingGame) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Game not found',
      });
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: Date.now(),
    };

    if (input.data.name !== undefined) {
      updateData.name = input.data.name;
      updateData.slug = generateSlug(input.data.name);
    }
    if (input.data.year !== undefined) updateData.year = input.data.year;
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
  .input(
    z.object({
      id: z.string(),
    })
  )
  .handler(async ({ input }) => {
    // Check if game exists
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, input.id))
      .limit(1);

    if (!game) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Game not found',
      });
    }

    // Get all resources for this game
    const gameResources = await db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.gameId, game.id));

    const resourceIds = gameResources.map((r) => r.id);

    if (resourceIds.length > 0) {
      // Get all fragments for deletion
      const gameFragments = await db
        .select({ id: fragments.id })
        .from(fragments)
        .where(inArray(fragments.resourceId, resourceIds));

      const fragmentIds = gameFragments.map((f) => f.id);

      // Delete in correct order to respect foreign keys
      if (fragmentIds.length > 0) {
        // 1. Delete embeddings
        await db.delete(embeddings).where(inArray(embeddings.fragmentId, fragmentIds));

        // 2. Delete fragments
        await db.delete(fragments).where(inArray(fragments.id, fragmentIds));
      }

      // 3. Delete attachments
      const gameAttachments = await db
        .select({ id: attachments.id, blobKey: attachments.blobKey })
        .from(attachments)
        .where(eq(attachments.gameId, game.id));

      if (gameAttachments.length > 0) {
        await db.delete(attachments).where(eq(attachments.gameId, game.id));

        // TODO: Delete from blob storage
        // const { bulkDelete } = await import('@/lib/services/blob-storage');
        // const keys = gameAttachments.map((a) => a.blobKey).filter((k): k is string => !!k);
        // if (keys.length > 0) {
        //   await bulkDelete(keys);
        // }
      }

      // 4. Delete resources
      await db.delete(resources).where(eq(resources.gameId, game.id));
    }

    // 5. Finally delete the game
    await db.delete(games).where(eq(games.id, game.id));

    return {
      success: true,
      deletedResources: resourceIds.length,
      message: `Game "${game.name}" and ${resourceIds.length} resources deleted`,
    };
  });

/**
 * Generate URL-safe slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
