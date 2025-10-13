import { XMLParser } from "fast-xml-parser";
import sharp from "sharp";
import type { BGGSearchResult, BGGGameDetails } from "../types/bgg";
import { db } from "../db";
import { bggGames } from "../db/schema";
import { eq, sql } from "drizzle-orm";

// Re-export types for convenience
export type { BGGSearchResult, BGGGameDetails };

// Rate limiting queue
class BGGRequestQueue {
  private lastRequestTime: number = 0;
  private readonly MIN_DELAY = 5000; // 5 seconds as recommended by BGG

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_DELAY) {
      const delay = this.MIN_DELAY - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
    return fn();
  }
}

const requestQueue = new BGGRequestQueue();

// Simple in-memory cache (could be replaced with KV)
const cache = new Map<
  string,
  { data: any; expiresAt: number }
>();

/**
 * Safely parse integer from string, returning null if invalid
 */
function parseIntSafe(value: string | undefined | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

function getFromCache<T>(key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }
  return cached.data as T;
}

function setCache(key: string, data: any, ttlMs: number) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Search BoardGameGeek for games by name
 * Fetches thumbnails for top results to help with disambiguation
 */
export async function searchBGGGames(
  query: string,
  options: {
    fetchThumbnails?: boolean; // Default true, fetches thumbnails for top 5 results
    maxResults?: number; // Default 10
  } = {}
): Promise<BGGSearchResult[]> {
  const { fetchThumbnails = true, maxResults = 10 } = options;
  const cacheKey = `bgg:search:${query.toLowerCase()}:${fetchThumbnails}`;
  const cached = getFromCache<BGGSearchResult[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const results = await requestQueue.enqueue(async () => {
    const url = new URL("https://boardgamegeek.com/xmlapi2/search");
    url.searchParams.set("query", query);
    url.searchParams.set("type", "boardgame,boardgameexpansion");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`BGG API error: ${response.statusText}`);
    }

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const parsed = parser.parse(xml);

    // Handle case where no results found
    if (!parsed.items || !parsed.items.item) {
      return [];
    }

    // Ensure items.item is always an array
    const items = Array.isArray(parsed.items.item)
      ? parsed.items.item
      : [parsed.items.item];

    return items.slice(0, maxResults).map((item: any) => ({
      id: item["@_id"],
      name: item.name?.["@_value"] || item.name,
      yearPublished: parseIntSafe(item.yearpublished?.["@_value"]),
      type: item["@_type"] as "boardgame" | "boardgameexpansion",
    }));
  });

  // Fetch thumbnails for top results to help with disambiguation
  if (fetchThumbnails && results.length > 0) {
    const topResults = results.slice(0, Math.min(5, results.length));

    // Fetch thumbnails for top results
    for (const result of topResults) {
      try {
        // Check if we have it cached in database first (no rate limiting needed)
        const cachedGame = await db
          .select({ thumbnailUrl: bggGames.thumbnailUrl })
          .from(bggGames)
          .where(eq(bggGames.bggId, result.id))
          .limit(1);

        if (cachedGame.length > 0) {
          result.thumbnailUrl = cachedGame[0].thumbnailUrl || undefined;
        } else {
          // Not in DB cache, need to fetch from API (rate limited)
          const details = await getBGGGameDetails(result.id);
          result.thumbnailUrl = details.thumbnailUrl;
        }
      } catch (error) {
        console.error(`[BGG] Failed to fetch thumbnail for ${result.id}:`, error);
        // Continue without thumbnail
      }
    }
  }

  // Cache for 1 hour
  setCache(cacheKey, results, 60 * 60 * 1000);
  return results;
}

/**
 * Get detailed game information from BGG
 * Checks database cache first, then falls back to API
 */
export async function getBGGGameDetails(
  bggId: string
): Promise<BGGGameDetails> {
  // Check database cache first
  const cachedGame = await db
    .select()
    .from(bggGames)
    .where(eq(bggGames.bggId, bggId))
    .limit(1);

  if (cachedGame.length > 0) {
    const game = cachedGame[0];
    return {
      id: game.bggId,
      name: game.name,
      description: game.description || "",
      yearPublished: game.yearPublished,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      playingTime: game.playingTime,
      imageUrl: game.imageUrl,
      thumbnailUrl: game.thumbnailUrl,
      publishers: game.publishers || [],
      designers: game.designers || [],
    };
  }

  const details = await requestQueue.enqueue(async () => {
    const url = new URL("https://boardgamegeek.com/xmlapi2/thing");
    url.searchParams.set("id", bggId);
    url.searchParams.set("stats", "1");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`BGG API error: ${response.statusText}`);
    }

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const parsed = parser.parse(xml);

    const item = parsed.items.item;

    // Extract name (prefer primary name)
    const names = Array.isArray(item.name) ? item.name : [item.name];
    const primaryName = names.find((n: any) => n["@_type"] === "primary");
    const name = primaryName?.["@_value"] || names[0]?.["@_value"] || "Unknown";

    // Extract description
    const description = item.description || "";

    // Extract year
    const yearPublished = parseIntSafe(item.yearpublished?.["@_value"]);

    // Extract player counts
    const minPlayers = parseIntSafe(item.minplayers?.["@_value"]);
    const maxPlayers = parseIntSafe(item.maxplayers?.["@_value"]);

    // Extract playing time
    const playingTime = parseIntSafe(item.playingtime?.["@_value"]);

    // Extract images (handle // prefix)
    let imageUrl = item.image || null;
    if (imageUrl && imageUrl.startsWith("//")) {
      imageUrl = `https:${imageUrl}`;
    }

    let thumbnailUrl = item.thumbnail || null;
    if (thumbnailUrl && thumbnailUrl.startsWith("//")) {
      thumbnailUrl = `https:${thumbnailUrl}`;
    }

    // Extract publishers
    const links = Array.isArray(item.link) ? item.link : item.link ? [item.link] : [];
    const publishers = links
      .filter((link: any) => link["@_type"] === "boardgamepublisher")
      .map((link: any) => link["@_value"])
      .slice(0, 5); // Limit to 5 publishers

    // Extract designers
    const designers = links
      .filter((link: any) => link["@_type"] === "boardgamedesigner")
      .map((link: any) => link["@_value"])
      .slice(0, 5); // Limit to 5 designers

    return {
      id: bggId,
      name,
      description,
      yearPublished,
      minPlayers,
      maxPlayers,
      playingTime,
      imageUrl,
      thumbnailUrl,
      publishers,
      designers,
    };
  });

  // Save to database cache for future lookups
  try {
    await db
      .insert(bggGames)
      .values({
        bggId: details.id,
        name: details.name,
        description: details.description,
        yearPublished: details.yearPublished,
        minPlayers: details.minPlayers,
        maxPlayers: details.maxPlayers,
        playingTime: details.playingTime,
        imageUrl: details.imageUrl,
        thumbnailUrl: details.thumbnailUrl,
        publishers: details.publishers,
        designers: details.designers,
        type: "boardgame", // Default type, could be enhanced
      })
      .onConflictDoUpdate({
        target: bggGames.bggId,
        set: {
          name: details.name,
          description: details.description,
          yearPublished: details.yearPublished,
          minPlayers: details.minPlayers,
          maxPlayers: details.maxPlayers,
          playingTime: details.playingTime,
          imageUrl: details.imageUrl,
          thumbnailUrl: details.thumbnailUrl,
          publishers: details.publishers,
          designers: details.designers,
          cachedAt: sql`now()`,
        },
      });
  } catch (error) {
    console.error(`[BGG] Failed to cache game ${bggId}:`, error);
    // Continue even if caching fails
  }

  return details;
}

/**
 * Download image from URL and convert to WebP format with target dimensions
 */
export async function downloadAndConvertImage(
  sourceUrl: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
  } = {}
): Promise<Buffer> {
  const {
    width = 900,
    height = 600,
    quality = 85,
  } = options;

  // Download the image
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Process with sharp: resize and convert to WebP
  const processed = await sharp(buffer)
    .resize(width, height, {
      fit: "cover", // Crop to fit aspect ratio
      position: "center",
    })
    .webp({ quality })
    .toBuffer();

  return processed;
}

/**
 * Extract BGG ID from a BGG URL
 */
export function extractBGGId(bggUrl: string): string | null {
  const match = bggUrl.match(/boardgame(?:expansion)?\/(\d+)/);
  return match ? match[1] : null;
}
