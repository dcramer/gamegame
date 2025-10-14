"use server";

import {
  searchBGGGames,
  getBGGGameDetails,
  downloadAndConvertImage,
  extractBGGId,
} from "../services/bgg";
import type { BGGSearchResult, BGGGameDetails } from "../types/bgg";
import { upload } from "../uploads/server";
import { createGame } from "./games";
import { requireAdmin } from "../auth/require-admin";
import { deleteImage } from "../services/images";
import { logger } from "../logger";

/**
 * Search BoardGameGeek for games
 */
export async function searchBGG(
  query: string
): Promise<BGGSearchResult[]> {
  await requireAdmin();

  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    // Disable thumbnail fetching for now - it's too slow with rate limiting
    // Takes 25+ seconds to fetch 5 thumbnails (5 second delay between each)
    return await searchBGGGames(query.trim(), { fetchThumbnails: false });
  } catch (error) {
    logger.error({ err: error, query }, "BGG search failed");
    throw new Error("Failed to search BoardGameGeek");
  }
}

/**
 * Fetch full game details from BGG, including processed image
 */
export async function fetchBGGGame(bggId: string): Promise<{
  details: BGGGameDetails;
  imageUrl: string | null;
}> {
  await requireAdmin();

  try {
    const details = await getBGGGameDetails(bggId);

    // Download and process the image if available
    let imageUrl: string | null = null;
    if (details.imageUrl) {
      try {
        const imageBuffer = await downloadAndConvertImage(details.imageUrl);

        // Upload to blob storage (imageBuffer is already a Buffer)
        const blob = await upload(
          `game-${bggId}.webp`,
          imageBuffer
        );

        imageUrl = blob.url;
      } catch (imageError) {
        logger.error({ err: imageError, bggId, imageUrl: details.imageUrl }, "BGG image processing failed");
        // Continue without image - user can upload manually
      }
    }

    return {
      details,
      imageUrl,
    };
  } catch (error) {
    logger.error({ err: error, bggId }, "Failed to fetch game from BGG");
    throw new Error("Failed to fetch game from BoardGameGeek");
  }
}

/**
 * Create a game directly from BGG data
 * Fetches from BGG (caching in database), downloads image, and creates game record
 */
export async function createGameFromBGG(bggId: string) {
  await requireAdmin();

  let uploadedImageUrl: string | null = null;

  try {
    const { details, imageUrl } = await fetchBGGGame(bggId);
    uploadedImageUrl = imageUrl;

    // Create the game with BGG data
    const game = await createGame({
      name: details.name,
      imageUrl,
      bggUrl: `https://boardgamegeek.com/boardgame/${bggId}`,
    });

    return game;
  } catch (error) {
    // Clean up uploaded image blob if game creation failed
    if (uploadedImageUrl) {
      await deleteImage(uploadedImageUrl).catch((cleanupError) => {
        logger.error({ err: cleanupError, imageUrl: uploadedImageUrl }, "Failed to cleanup image blob after error");
      });
    }

    logger.error({ err: error, bggId }, "Failed to create game from BGG");

    // Check if it's a duplicate name error
    if (error instanceof Error && error.message.includes("unique constraint")) {
      throw new Error("A game with this name already exists");
    }

    throw new Error("Failed to create game from BoardGameGeek");
  }
}

