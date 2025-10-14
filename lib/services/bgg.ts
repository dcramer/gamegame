import { XMLParser } from "fast-xml-parser";
import sharp from "sharp";
import type { BGGSearchResult, BGGGameDetails } from "../types/bgg";
import { db } from "../db";
import { bggGames } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { logger, logTiming } from "../logger";
import { withRetry } from "../retry";
import { kv } from "@vercel/kv";
import { env } from "../env.mjs";

// Re-export types for convenience
export type { BGGSearchResult, BGGGameDetails };

/**
 * Rate limiting queue for BGG API requests
 * Uses Vercel KV as a distributed lock when available to ensure
 * only one request happens every 5 seconds across all serverless instances.
 * Falls back to in-memory rate limiting in development.
 */
class BGGRequestQueue {
  private readonly MIN_DELAY = 5000; // 5 seconds as recommended by BGG
  private readonly KV_KEY = "bgg:ratelimit";
  private readonly MAX_WAIT = 30000; // 30 seconds max wait
  private lastRequestTime: number = 0; // In-memory fallback

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    // If KV is not available, fall back to simple in-memory rate limiting
    if (!env.KV_REST_API_TOKEN) {
      logger.debug("BGG rate limit: using in-memory mode (KV not available)");
      return this.enqueueInMemory(fn);
    }

    // Use KV-based distributed locking
    return this.enqueueDistributed(fn);
  }

  /**
   * In-memory rate limiting (used when KV is unavailable)
   * Only protects within a single serverless instance
   */
  private async enqueueInMemory<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_DELAY) {
      const delay = this.MIN_DELAY - timeSinceLastRequest;
      logger.debug(
        { delay, timeSinceLastRequest },
        "BGG rate limit (in-memory): delaying request"
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
    return fn();
  }

  /**
   * KV-based distributed rate limiting
   * Uses Redis SET NX with expiry to create a distributed lock
   * that ensures only one request happens every 5 seconds across all instances
   */
  private async enqueueDistributed<T>(fn: () => Promise<T>): Promise<T> {
    const startWait = Date.now();

    // Try to acquire the lock
    while (true) {
      // Timeout check
      if (Date.now() - startWait > this.MAX_WAIT) {
        logger.error(
          { waitTime: Date.now() - startWait },
          "BGG rate limit: exceeded maximum wait time, falling back to in-memory"
        );
        return this.enqueueInMemory(fn);
      }

      try {
        // Try to set a lock that expires in 5 seconds
        // SET with NX (only set if not exists) and PX (expire milliseconds)
        const wasSet = await kv.set(this.KV_KEY, Date.now(), {
          nx: true, // Only set if key doesn't exist
          px: this.MIN_DELAY, // Expire after 5 seconds
        });

        if (wasSet) {
          // We got the lock! Make the request
          logger.debug("BGG rate limit: acquired distributed lock");
          try {
            return await fn();
          } finally {
            // Lock will auto-expire after 5 seconds, no need to delete
          }
        }

        // Lock exists, someone else is making a request
        // Wait a bit and retry
        const waitTime = Date.now() - startWait;
        logger.debug({ waitTime }, "BGG rate limit: waiting for distributed lock");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(
          { err: error },
          "BGG rate limit: KV error, falling back to in-memory"
        );
        return this.enqueueInMemory(fn);
      }
    }
  }
}

const requestQueue = new BGGRequestQueue();

/**
 * Safely parse integer from string, returning null if invalid
 */
function parseIntSafe(value: string | undefined | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
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
  const endTimer = logTiming("bgg-search");
  const log = logger.child({
    operation: "searchBGGGames",
    query,
    fetchThumbnails: options.fetchThumbnails,
    maxResults: options.maxResults,
  });
  log.info("Searching BGG for games");

  const { fetchThumbnails = true, maxResults = 10 } = options;

  const results = await requestQueue.enqueue(async () => {
    return await withRetry(
      async () => {
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
      },
      {
        operationName: "bgg-search",
        maxRetries: 2, // BGG is rate-limited, fewer retries
        initialDelay: 3000,
      }
    );
  });

  log.info({ resultCount: results.length }, "BGG search completed");

  // Fetch thumbnails for top results to help with disambiguation
  if (fetchThumbnails && results.length > 0) {
    const topResults = results.slice(0, Math.min(5, results.length));
    log.debug({ thumbnailCount: topResults.length }, "Fetching thumbnails for top results");

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
        log.error({ err: error, bggId: result.id }, "Failed to fetch thumbnail");
        // Continue without thumbnail
      }
    }
  }

  endTimer({ resultCount: results.length, success: true });
  return results;
}

/**
 * Get detailed game information from BGG
 * Checks database cache first, then falls back to API
 */
export async function getBGGGameDetails(
  bggId: string
): Promise<BGGGameDetails> {
  const log = logger.child({
    operation: "getBGGGameDetails",
    bggId,
  });

  // Check database cache first
  const cachedGame = await db
    .select()
    .from(bggGames)
    .where(eq(bggGames.bggId, bggId))
    .limit(1);

  if (cachedGame.length > 0) {
    log.debug("BGG game found in database cache");
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

  log.info("BGG game not in cache, fetching from API");

  const details = await requestQueue.enqueue(async () => {
    return await withRetry(
      async () => {
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
      },
      {
        operationName: "bgg-game-details",
        maxRetries: 2, // BGG is rate-limited, fewer retries
        initialDelay: 3000,
      }
    );
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
    log.debug("BGG game cached to database");
  } catch (error) {
    log.error({ err: error }, "Failed to cache BGG game to database");
    // Continue even if caching fails
  }

  log.info({ name: details.name }, "BGG game details fetched successfully");
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
  const endTimer = logTiming("bgg-image-download");
  const log = logger.child({
    operation: "downloadAndConvertImage",
    sourceUrl,
    options,
  });
  log.info("Downloading and converting BGG image");

  const {
    width = 900,
    height = 600,
    quality = 85,
  } = options;

  // Download the image
  log.debug("Fetching image from source URL");
  const buffer = await withRetry(
    async () => {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },
    {
      operationName: "bgg-image-fetch",
      maxRetries: 3,
      initialDelay: 1000,
    }
  );
  log.debug({ originalSize: buffer.length }, "Image downloaded");

  // Process with sharp: resize and convert to WebP
  log.debug("Converting image to WebP");
  const processed = await sharp(buffer)
    .resize(width, height, {
      fit: "cover", // Crop to fit aspect ratio
      position: "center",
    })
    .webp({ quality })
    .toBuffer();

  endTimer({
    originalSize: buffer.length,
    processedSize: processed.length,
    success: true,
  });

  return processed;
}

/**
 * Extract BGG ID from a BGG URL
 */
export function extractBGGId(bggUrl: string): string | null {
  const match = bggUrl.match(/boardgame(?:expansion)?\/(\d+)/);
  return match ? match[1] : null;
}
