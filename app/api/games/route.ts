/**
 * Games API Routes
 * GET /api/games - List all games
 * POST /api/games - Create new game (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games, resources } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { withAdmin, errorResponse, successResponse } from '@/lib/api/middleware';
import { createGameSchema, gameListResponseSchema } from '@/lib/api/schemas';
import { generateSlug } from '@/lib/api/helpers';

/**
 * GET /api/games
 * List all games with resource counts
 */
export async function GET() {
  try {
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

    return NextResponse.json(gamesList);
  } catch (error) {
    console.error('[GET /api/games] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/games
 * Create a new game (admin only)
 */
export const POST = withAdmin(async (request) => {
  try {
    const body = await request.json();
    const data = createGameSchema.parse(body);

    // Generate slug from name (include year if provided)
    const slug = generateSlug(data.name, data.year ?? null);

    // Extract BGG ID from URL if provided
    let bggId: string | null = null;
    if (data.bggUrl) {
      const match = data.bggUrl.match(/\/boardgame\/(\d+)/);
      if (match) {
        bggId = match[1];
      }
    }

    const gameId = nanoid();

    await db.insert(games).values({
      id: gameId,
      name: data.name,
      year: data.year ?? null,
      slug,
      imageUrl: data.imageUrl ?? null,
      bggId,
      bggUrl: data.bggUrl ?? null,
    });

    const [newGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    return successResponse(newGame, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation error', 400, 'VALIDATION_ERROR', error.issues);
    }

    console.error('[POST /api/games] Error:', error);
    return errorResponse('Failed to create game', 500, 'INTERNAL_ERROR');
  }
});
