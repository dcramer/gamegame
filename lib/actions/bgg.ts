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
import { auth } from "@/auth";
import { deleteImage } from "../services/images";

/**
 * Search BoardGameGeek for games
 */
export async function searchBGG(
  query: string
): Promise<BGGSearchResult[]> {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    // Disable thumbnail fetching for now - it's too slow with rate limiting
    // Takes 25+ seconds to fetch 5 thumbnails (5 second delay between each)
    return await searchBGGGames(query.trim(), { fetchThumbnails: false });
  } catch (error) {
    console.error("[BGG] Search error:", error);
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
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

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
        console.error("[BGG] Image processing error:", imageError);
        // Continue without image - user can upload manually
      }
    }

    return {
      details,
      imageUrl,
    };
  } catch (error) {
    console.error("[BGG] Fetch game error:", error);
    throw new Error("Failed to fetch game from BoardGameGeek");
  }
}

/**
 * Create a game directly from BGG data
 * Fetches from BGG (caching in database), downloads image, and creates game record
 */
export async function createGameFromBGG(bggId: string) {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

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
        console.error('[createGameFromBGG] Failed to cleanup image blob after error:', cleanupError);
      });
    }

    console.error("[BGG] Create game from BGG error:", error);

    // Check if it's a duplicate name error
    if (error instanceof Error && error.message.includes("unique constraint")) {
      throw new Error("A game with this name already exists");
    }

    throw new Error("Failed to create game from BoardGameGeek");
  }
}

