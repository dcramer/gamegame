"use server";

import { asc, eq } from "drizzle-orm";
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
  return game;
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

  const { name } = insertGameSchema.parse(input);

  const [game] = await db.insert(games).values({ name }).returning();

  return game;
};
