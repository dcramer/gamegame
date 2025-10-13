"use server";

import { asc, eq, exists, sql } from "drizzle-orm";
import { db } from "../db";
import { games, insertGameSchema, NewGameParams } from "../db/schema/games";
import { resources } from "../db/schema/resources";
import { attachments } from "../db/schema/attachments";
import { auth } from "@/auth";
import { deleteImage, deleteImages } from "../services/images";

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
      hasResources: sql<boolean>`EXISTS (SELECT 1 FROM ${resources} WHERE ${resources.gameId} = ${games.id})`,
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
    imageUrl?: string | null;
    bggUrl?: string | null;
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

  // Track old image URL for cleanup if imageUrl is changing
  const oldImageUrl = game.imageUrl;
  const isImageChanging = 'imageUrl' in parsedInput && parsedInput.imageUrl !== oldImageUrl;

  const [updatedGame] = await db
    .update(games)
    .set(parsedInput)
    .where(eq(games.id, gameId))
    .returning({
      id: games.id,
      name: games.name,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
    });

  // Clean up old image blob if imageUrl changed (best effort)
  if (isImageChanging && oldImageUrl) {
    await deleteImage(oldImageUrl).catch((cleanupError) => {
      console.error('[updateGame] Failed to cleanup old image blob:', cleanupError);
      // Don't fail the operation if blob cleanup fails
    });
  }

  return updatedGame;
};

export const deleteGame = async (gameId: string) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  // Get game image URL and all attachments before deletion
  const [game] = await db
    .select({ imageUrl: games.imageUrl })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (!game) {
    throw new Error("Game not found");
  }

  const gameAttachments = await db
    .select({ url: attachments.url })
    .from(attachments)
    .where(eq(attachments.gameId, gameId));

  // Delete game (cascades to resources, fragments, and attachments)
  await db.delete(games).where(eq(games.id, gameId));

  // Clean up blob files (best effort - don't fail if cleanup fails)
  const blobUrls: string[] = [];

  if (game.imageUrl) {
    blobUrls.push(game.imageUrl);
  }

  if (gameAttachments.length > 0) {
    blobUrls.push(...gameAttachments.map((a) => a.url));
  }

  if (blobUrls.length > 0) {
    await deleteImages(blobUrls).catch((cleanupError) => {
      console.error('[deleteGame] Failed to cleanup blobs:', cleanupError);
      // Don't fail the operation if blob cleanup fails
    });
  }

  return {};
};
