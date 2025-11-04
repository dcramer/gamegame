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
import { requireAdmin } from '@/lib/auth/helpers';

// Schema for creating a game
const createGameSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1900).max(2100).optional(),
  imageUrl: z.string().min(1).optional(),
  bggUrl: z.string().url().optional(),
});

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
export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin();

    const body = await request.json();
    const data = createGameSchema.parse(body);

    // Generate slug from name
    const slug = generateSlug(data.name);

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

    return NextResponse.json(newGame, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('[POST /api/games] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create game' },
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
