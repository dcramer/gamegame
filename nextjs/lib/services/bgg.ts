import { XMLParser } from 'fast-xml-parser';
import { kv } from '@vercel/kv';
import type { BGGSearchResult, BGGGameDetails } from '../types/bgg';
import { db } from '../db';
import { bggGames } from '../db/schema/bgg_games';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';

// Re-export types for convenience
export type { BGGSearchResult, BGGGameDetails };

/**
 * User-Agent for BGG API requests
 * BGG requires a proper User-Agent to prevent abuse
 */
const BGG_USER_AGENT = 'GameGame (https://gamegame.ai)';

/**
 * Rate limiting queue for BGG API requests
 * Uses Vercel KV as a distributed lock to ensure
 * only one request happens every 5 seconds across all serverless functions.
 */
class BGGRequestQueue {
  private readonly MIN_DELAY = 5000; // 5 seconds as recommended by BGG
  private readonly KV_KEY = 'bgg:ratelimit';
  private readonly MAX_WAIT = 30000; // 30 seconds max wait
  private readonly useKV: boolean;
  private lastRequestTime: number = 0; // In-memory fallback

  constructor(useKV: boolean = true) {
    this.useKV = useKV;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    // If KV is not available, fall back to simple in-memory rate limiting
    if (!this.useKV) {
      console.log('BGG rate limit: using in-memory mode (KV not available)');
      return this.enqueueInMemory(fn);
    }

    // Use KV-based distributed locking
    return this.enqueueDistributed(fn);
  }

  /**
   * In-memory rate limiting (used when KV is unavailable)
   * Only protects within a single serverless function instance
   */
  private async enqueueInMemory<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_DELAY) {
      const delay = this.MIN_DELAY - timeSinceLastRequest;
      console.log(`BGG rate limit (in-memory): delaying request by ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
    return fn();
  }

  /**
   * KV-based distributed rate limiting
   * Uses KV set() with expiration to create a distributed lock
   * that ensures only one request happens every 5 seconds across all instances
   */
  private async enqueueDistributed<T>(fn: () => Promise<T>): Promise<T> {
    const startWait = Date.now();

    // Try to acquire the lock
    while (true) {
      // Timeout check
      if (Date.now() - startWait > this.MAX_WAIT) {
        console.error(
          `BGG rate limit: exceeded maximum wait time (${this.MAX_WAIT}ms), falling back to in-memory`
        );
        return this.enqueueInMemory(fn);
      }

      try {
        // Try to get current lock
        const currentLock = await kv.get(this.KV_KEY);

        if (!currentLock) {
          // No lock exists, try to set one
          await kv.set(this.KV_KEY, Date.now().toString(), {
            ex: 60, // Vercel KV minimum is 60 seconds
          });

          // We got the lock! Make the request
          console.log('BGG rate limit: acquired distributed lock');
          try {
            return await fn();
          } finally {
            // Lock will auto-expire after 60 seconds
          }
        }

        // Lock exists, someone else is making a request
        // Wait a bit and retry
        const waitTime = Date.now() - startWait;
        console.log(`BGG rate limit: waiting for distributed lock (${waitTime}ms elapsed)`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('BGG rate limit: KV error, falling back to in-memory', error);
        return this.enqueueInMemory(fn);
      }
    }
  }
}

/**
 * Safely parse integer from string, returning null if invalid
 */
function parseIntSafe(value: string | undefined | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Retry helper for network requests
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const { maxRetries = 3, initialDelay = 1000, operationName = 'operation' } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(
          `${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`,
          lastError.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
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
    apiKey?: string; // BGG API key (required as of 2025)
    useKV?: boolean; // Use Vercel KV for rate limiting (default true)
  } = {}
): Promise<BGGSearchResult[]> {
  console.log(`Searching BGG for: "${query}"`);

  const { fetchThumbnails = true, maxResults = 10, apiKey, useKV = true } = options;
  const requestQueue = new BGGRequestQueue(useKV);

  const results = await requestQueue.enqueue(async () => {
    return await withRetry(
      async () => {
        const url = new URL('https://boardgamegeek.com/xmlapi2/search');
        url.searchParams.set('query', query);
        url.searchParams.set('type', 'boardgame,boardgameexpansion');

        const headers: Record<string, string> = {
          'User-Agent': BGG_USER_AGENT,
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url.toString(), { headers });
        if (!response.ok) {
          const body = await response.text();
          console.error(
            `BGG API error: ${response.status} ${response.statusText}`,
            body.substring(0, 200)
          );
          throw new Error(`BGG API error: ${response.status} ${response.statusText}`);
        }

        const xml = await response.text();
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
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
          id: item['@_id'],
          name: item.name?.['@_value'] || item.name,
          yearPublished: parseIntSafe(item.yearpublished?.['@_value']),
          type: item['@_type'] as 'boardgame' | 'boardgameexpansion',
        }));
      },
      {
        operationName: 'bgg-search',
        maxRetries: 2, // BGG is rate-limited, fewer retries
        initialDelay: 3000,
      }
    );
  });

  console.log(`BGG search completed: ${results.length} results`);

  // Fetch thumbnails for top results to help with disambiguation
  if (fetchThumbnails && results.length > 0) {
    const topResults = results.slice(0, Math.min(5, results.length));
    console.log(`Fetching thumbnails for ${topResults.length} top results`);

    // Fetch thumbnails for top results
    for (const result of topResults) {
      try {
        // Check if we have it cached in database first (no rate limiting needed)
        const cachedGame = await db
          .select({ thumbnailUrl: bggGames.thumbnailUrl })
          .from(bggGames)
          .where(eq(bggGames.id, result.id))
          .limit(1);

        if (cachedGame.length > 0) {
          result.thumbnailUrl = cachedGame[0].thumbnailUrl || undefined;
        } else {
          // Not in DB cache, need to fetch from API (rate limited)
          const details = await getBGGGameDetails(result.id, { apiKey, useKV });
          result.thumbnailUrl = details.thumbnailUrl;
        }
      } catch (error) {
        console.error(`Failed to fetch thumbnail for BGG ID ${result.id}:`, error);
        // Continue without thumbnail
      }
    }
  }

  return results;
}

/**
 * Get detailed game information from BGG
 * Checks database cache first, then falls back to API
 */
export async function getBGGGameDetails(
  bggId: string,
  options: { bypassCache?: boolean; apiKey?: string; useKV?: boolean } = {}
): Promise<BGGGameDetails> {
  console.log(`Fetching BGG game details for ID: ${bggId}`);

  const { bypassCache = false, apiKey, useKV = true } = options;

  // Check database cache first (unless bypassing)
  if (!bypassCache) {
    const cachedGame = await db.select().from(bggGames).where(eq(bggGames.id, bggId)).limit(1);

    if (cachedGame.length > 0) {
      console.log('BGG game found in database cache');
      const game = cachedGame[0];
      return {
        id: game.id,
        name: game.name,
        description: game.description || '',
        yearPublished: game.yearPublished,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        playingTime: game.playingTime,
        imageUrl: game.imageUrl,
        thumbnailUrl: game.thumbnailUrl,
        publishers: game.publishers ? JSON.parse(game.publishers) : [],
        designers: game.designers ? JSON.parse(game.designers) : [],
      };
    }
  } else {
    console.log('Bypassing cache, fetching fresh data from BGG API');
  }

  console.log('BGG game not in cache, fetching from API');

  const requestQueue = new BGGRequestQueue(useKV);
  const details = await requestQueue.enqueue(async () => {
    return await withRetry(
      async () => {
        const url = new URL('https://boardgamegeek.com/xmlapi2/thing');
        url.searchParams.set('id', bggId);
        url.searchParams.set('stats', '1');

        const headers: Record<string, string> = {
          'User-Agent': BGG_USER_AGENT,
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url.toString(), { headers });
        if (!response.ok) {
          const body = await response.text();
          console.error(
            `BGG API error: ${response.status} ${response.statusText}`,
            body.substring(0, 200)
          );
          throw new Error(`BGG API error: ${response.status} ${response.statusText}`);
        }

        const xml = await response.text();
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
        });
        const parsed = parser.parse(xml);

        const item = parsed.items.item;

        // Extract name (prefer primary name)
        const names = Array.isArray(item.name) ? item.name : [item.name];
        const primaryName = names.find((n: any) => n['@_type'] === 'primary');
        const name = primaryName?.['@_value'] || names[0]?.['@_value'] || 'Unknown';

        // Extract description
        const description = item.description || '';

        // Extract year
        const yearPublished = parseIntSafe(item.yearpublished?.['@_value']);

        // Extract player counts
        const minPlayers = parseIntSafe(item.minplayers?.['@_value']);
        const maxPlayers = parseIntSafe(item.maxplayers?.['@_value']);

        // Extract playing time
        const playingTime = parseIntSafe(item.playingtime?.['@_value']);

        // Extract images (handle // prefix)
        let imageUrl = item.image || null;
        if (imageUrl && imageUrl.startsWith('//')) {
          imageUrl = `https:${imageUrl}`;
        }

        let thumbnailUrl = item.thumbnail || null;
        if (thumbnailUrl && thumbnailUrl.startsWith('//')) {
          thumbnailUrl = `https:${thumbnailUrl}`;
        }

        // Extract publishers
        const links = Array.isArray(item.link) ? item.link : item.link ? [item.link] : [];
        const publishers = links
          .filter((link: any) => link['@_type'] === 'boardgamepublisher')
          .map((link: any) => link['@_value'])
          .slice(0, 5); // Limit to 5 publishers

        // Extract designers
        const designers = links
          .filter((link: any) => link['@_type'] === 'boardgamedesigner')
          .map((link: any) => link['@_value'])
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
        operationName: 'bgg-game-details',
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
        id: details.id,
        name: details.name,
        description: details.description,
        yearPublished: details.yearPublished,
        minPlayers: details.minPlayers,
        maxPlayers: details.maxPlayers,
        playingTime: details.playingTime,
        imageUrl: details.imageUrl,
        thumbnailUrl: details.thumbnailUrl,
        publishers: JSON.stringify(details.publishers),
        designers: JSON.stringify(details.designers),
      })
      .onConflictDoUpdate({
        target: bggGames.id,
        set: {
          name: details.name,
          description: details.description,
          yearPublished: details.yearPublished,
          minPlayers: details.minPlayers,
          maxPlayers: details.maxPlayers,
          playingTime: details.playingTime,
          imageUrl: details.imageUrl,
          thumbnailUrl: details.thumbnailUrl,
          publishers: JSON.stringify(details.publishers),
          designers: JSON.stringify(details.designers),
          cachedAt: new Date(),
        },
      });
    console.log('BGG game cached to database');
  } catch (error) {
    console.error('Failed to cache BGG game to database:', error);
    // Continue even if caching fails
  }

  console.log(`BGG game details fetched successfully: ${details.name}`);
  return details;
}

/**
 * Download image from URL and convert to WebP
 */
export async function downloadImage(sourceUrl: string): Promise<Buffer> {
  console.log(`Downloading BGG image from: ${sourceUrl}`);

  // Download the image
  const originalBuffer = await withRetry(
    async () => {
      const response = await fetch(sourceUrl, {
        headers: {
          'User-Agent': BGG_USER_AGENT,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },
    {
      operationName: 'bgg-image-fetch',
      maxRetries: 3,
      initialDelay: 1000,
    }
  );

  console.log(`Image downloaded: ${originalBuffer.length} bytes, converting to WebP...`);

  // Convert to WebP using Sharp
  const webpBuffer = await sharp(originalBuffer)
    .resize(900, 600, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();

  console.log(`Image converted to WebP: ${webpBuffer.length} bytes`);
  return webpBuffer;
}

/**
 * Extract BGG ID from a BGG URL
 */
export function extractBGGId(bggUrl: string): string | null {
  const match = bggUrl.match(/boardgame(?:expansion)?\/(\d+)/);
  return match ? match[1] : null;
}
