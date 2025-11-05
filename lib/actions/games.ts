"use server";

import { asc, eq, exists, sql } from "drizzle-orm";
import { db } from "../db";
import { games, insertGameSchema, NewGameParams } from "../db/schema/games";
import { resources } from "../db/schema/resources";
import { attachments } from "../db/schema/attachments";
import { requireAdmin } from "../auth/helpers";
import { deleteImage, deleteImages } from "../services/images";
import { logger } from "../logger";

export const getGame = async (input: string) => {
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggId: games.bggId,
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
      hasResources: sql<boolean>`(${db.$count(resources, eq(resources.gameId, games.id))} > 0)`,
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
  await requireAdmin();

  const parsedInput = insertGameSchema.parse(input);

  // Generate slug from name
  const slug = parsedInput.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const [game] = await db.insert(games).values({
    ...parsedInput,
    slug,
  }).returning({
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
  await requireAdmin();

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

  // Filter out undefined values
  const parsedInput: Partial<NewGameParams> = {};
  if (input.name !== undefined) parsedInput.name = input.name;
  if (input.imageUrl !== undefined) parsedInput.imageUrl = input.imageUrl;
  if (input.bggUrl !== undefined) parsedInput.bggUrl = input.bggUrl;

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
      logger.error({ err: cleanupError, gameId, oldImageUrl }, "Failed to cleanup old image blob");
      // Don't fail the operation if blob cleanup fails
    });
  }

  return updatedGame;
};

export const deleteGame = async (gameId: string) => {
  await requireAdmin();

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
      logger.error({ err: cleanupError, gameId, blobCount: blobUrls.length }, "Failed to cleanup game blobs");
      // Don't fail the operation if blob cleanup fails
    });
  }

  return {};
};
