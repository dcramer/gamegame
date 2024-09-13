"use server";

import { asc, eq, exists, sql } from "drizzle-orm";
import { db } from "../db";
import { games, insertGameSchema, NewGameParams } from "../db/schema/games";
import { resources } from "../db/schema/resources";
import { auth } from "@/auth";

export const getGame = async (input: string) => {
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
    })
    .from(games)
    .where(eq(games.id, input))
    .limit(1);
  if (!game) {
    throw new Error("Game not found");
  }

  const [{ count: resourceCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(resources)
    .where(eq(resources.gameId, game.id))
    .limit(1);

  return {
    ...game,
    resourceCount,
  };
};

export const getAllGames = async (withResources: boolean = true) => {
  const gameList = await db
    .select({
      id: games.id,
      name: games.name,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
      hasResources: exists(
        db.select().from(resources).where(eq(resources.gameId, games.id))
      ),
    })
    .from(games)
    .orderBy(asc(games.name))
    .where(
      withResources
        ? exists(
            db.select().from(resources).where(eq(resources.gameId, games.id))
          )
        : undefined
    );
  return gameList;
};

export const createGame = async (input: NewGameParams) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const parsedInput = insertGameSchema.parse(input);

  const [game] = await db.insert(games).values(parsedInput).returning({
    id: games.id,
    name: games.name,
    imageUrl: games.imageUrl,
    bggUrl: games.bggUrl,
  });

  return {
    ...game,
    hasResources: false,
  };
};

export const updateGame = async (
  gameId: string,
  input: {
    name?: string;
    imageUrl?: string;
    bggUrl?: string;
  }
) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
    })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  if (!game) {
    throw new Error("Game not found");
  }

  const parsedInput = insertGameSchema.partial().parse(input);
  if (Object.keys(parsedInput).length === 0) {
    return game;
  }

  const newGame = await db
    .update(games)
    .set(parsedInput)
    .where(eq(games.id, gameId))
    .returning({
      id: games.id,
      name: games.name,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
    });

  return {
    ...game,
    ...newGame,
  };
};

export const deleteGame = async (gameId: string) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  await db.delete(games).where(eq(games.id, gameId));

  return {};
};
