/**
 * Individual Game API Routes
 * GET /api/games/:gameIdOrSlug - Get game by ID or slug
 * PATCH /api/games/:gameId - Update game (admin)
 * DELETE /api/games/:gameId - Delete game (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games, resources, fragments, attachments, embeddings } from '@/lib/db/schema';
import { eq, or, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/helpers';

// Schema for updating a game
const updateGameSchema = z.object({
  name: z.string().min(1).optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  bggUrl: z.string().url().nullable().optional(),
});

/**
 * GET /api/games/:gameIdOrSlug
 * Get single game by ID or slug
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { gameIdOrSlug: string } }
) {
  try {
    const { gameIdOrSlug } = params;

    // Support both slug and ID lookups
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
      .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
      .limit(1);

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Get resource count
    const resourceCount = await db
      .select({ count: resources.id })
      .from(resources)
      .where(eq(resources.gameId, game.id));

    return NextResponse.json({
      ...game,
      resourceCount: resourceCount.length,
    });
  } catch (error) {
    console.error('[GET /api/games/:gameIdOrSlug] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/games/:gameId
 * Update game (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { gameIdOrSlug: string } }
) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { gameIdOrSlug } = params;
    const body = await request.json();
    const data = updateGameSchema.parse(body);

    // Check if game exists
    const [existingGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameIdOrSlug))
      .limit(1);

    if (!existingGame) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: Date.now(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
      updateData.slug = generateSlug(data.name);
    }
    if (data.year !== undefined) updateData.year = data.year;
    if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
    if (data.bggUrl !== undefined) {
      updateData.bggUrl = data.bggUrl;
      // Extract BGG ID from URL
      if (data.bggUrl) {
        const match = data.bggUrl.match(/\/boardgame\/(\d+)/);
        if (match) {
          updateData.bggId = match[1];
        }
      } else {
        updateData.bggId = null;
      }
    }

    await db
      .update(games)
      .set(updateData)
      .where(eq(games.id, gameIdOrSlug));

    const [updatedGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameIdOrSlug))
      .limit(1);

    return NextResponse.json(updatedGame);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[PATCH /api/games/:gameId] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update game' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/games/:gameId
 * Delete game and all associated data (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { gameIdOrSlug: string } }
) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { gameIdOrSlug } = params;

    // Check if game exists
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameIdOrSlug))
      .limit(1);

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
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

      // 3. Delete attachments (with blob cleanup)
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

    return NextResponse.json({
      success: true,
      deletedResources: resourceIds.length,
      message: `Game "${game.name}" and ${resourceIds.length} resources deleted`,
    });
  } catch (error) {
    console.error('[DELETE /api/games/:gameId] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete game' },
      { status: 500 }
    );
  }
}

/**
 * Generate URL-safe slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
