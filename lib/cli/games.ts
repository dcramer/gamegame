/**
 * Shared game utilities for CLI
 */

import { db } from '../db';
import { games } from '../db/schema/games';
import { resources } from '../db/schema/resources';
import { asc, eq, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface Game {
  id: string;
  name: string;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount: number;
}

export async function listGamesForCLI(): Promise<Game[]> {
  const gameList = await db
    .select({
      id: games.id,
      name: games.name,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
    })
    .from(games)
    .orderBy(asc(games.name));

  // Get resource counts
  const gamesWithCounts = await Promise.all(
    gameList.map(async (game) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(resources)
        .where(eq(resources.gameId, game.id))
        .limit(1);
      return { ...game, resourceCount: count };
    })
  );

  return gamesWithCounts;
}

export async function createGameForCLI(input: {
  name: string;
  bggUrl?: string;
}): Promise<Game> {
  // Generate slug from name
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const [game] = await db
    .insert(games)
    .values({
      id: nanoid(),
      name: input.name,
      slug,
      bggUrl: input.bggUrl || null,
      imageUrl: null,
    })
    .returning({
      id: games.id,
      name: games.name,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
    });

  return { ...game, resourceCount: 0 };
}

export async function getGameByIdOrSlug(idOrSlug: string): Promise<Game | null> {
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
    })
    .from(games)
    .where(or(eq(games.id, idOrSlug), eq(games.slug, idOrSlug)))
    .limit(1);

  if (!game) {
    return null;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(resources)
    .where(eq(resources.gameId, game.id))
    .limit(1);

  return { ...game, resourceCount: count };
}
