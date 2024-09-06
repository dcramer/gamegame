"use server";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { games, insertGameSchema, NewGameParams } from "../db/schema/games";
import { resources } from "../db/schema/resources";
import { auth } from "@/auth";

export const getGame = async (input: string) => {
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, input))
    .limit(1);

  const [{ count: resourceCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(resources)
    .where(eq(resources.gameId, game.id))
    .limit(1);

  return {
    id: game.id,
    name: game.name,
    imageUrl: game.imageUrl,
    resourceCount,
  };
};

export const getAllGames = async () => {
  return await db.select().from(games).orderBy(asc(games.name));
};

export const getAllResourcesForGame = async (gameId: string) => {
  return await db
    .select()
    .from(resources)
    .where(eq(resources.gameId, gameId))
    .orderBy(asc(resources.name));
};

export const createGame = async (input: NewGameParams) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const { name, imageUrl } = insertGameSchema.parse(input);

  const [game] = await db.insert(games).values({ name, imageUrl }).returning();

  return {
    id: game.id,
    name: game.name,
    imageUrl: game.imageUrl,
  };
};

export const updateGame = async (
  gameId: string,
  input: {
    name?: string;
    imageUrl?: string;
  }
) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  if (!game) {
    throw new Error("Game not found");
  }

  await db.update(games).set(input).where(eq(games.id, gameId));

  return {
    id: game.id,
    name: game.name,
    imageUrl: game.imageUrl,
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
