/**
 * Rate Limiting Service
 * Uses Vercel KV (@upstash/ratelimit) for distributed rate limiting
 */

import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';
import { env } from '@/lib/env.mjs';

/**
 * Rate limit types for different endpoint categories
 */
export type RateLimitType = 'chat' | 'search' | 'upload' | 'api' | 'bgg';

/**
 * Duration type for Upstash Ratelimit
 * Must match format: `${number} ${Unit}` or `${number}${Unit}`
 * Where Unit is "ms" | "s" | "m" | "h" | "d"
 */
type Duration = `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}` | `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;

/**
 * Rate limit configuration per type
 * - Chat: 20 requests per 60 seconds (heavy LLM workload)
 * - Search: 30 requests per 60 seconds
 * - Upload: 10 requests per 60 seconds (expensive file operations)
 * - API: 60 requests per 60 seconds (general API endpoints)
 * - BGG: 10 requests per 60 seconds (external API dependency)
 */
const RATE_LIMIT_CONFIG: Record<
  RateLimitType,
  { requests: number; window: Duration }
> = {
  chat: { requests: 20, window: '60 s' },
  search: { requests: 30, window: '60 s' },
  upload: { requests: 10, window: '60 s' },
  api: { requests: 60, window: '60 s' },
  bgg: { requests: 10, window: '60 s' },
};

/**
 * Cache for rate limiter instances (one per type)
 */
const rateLimiters = new Map<RateLimitType, Ratelimit | null>();

/**
 * Check if KV is available
 */
function isKVAvailable(): boolean {
  return !!(env.KV_URL && env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
}

/**
 * Get or create a rate limiter for a specific type
 * Returns null if KV is not configured (graceful degradation)
 */
export function getRateLimiter(type: RateLimitType): Ratelimit | null {
  // Check if we already have a limiter for this type
  if (rateLimiters.has(type)) {
    return rateLimiters.get(type) || null;
  }

  // Check if KV is available
  if (!isKVAvailable()) {
    if (env.NODE_ENV === 'development') {
      console.warn(
        `[rate-limit] KV not configured, rate limiting disabled for ${type}. Set KV_URL, KV_REST_API_URL, and KV_REST_API_TOKEN to enable.`
      );
    }
    rateLimiters.set(type, null);
    return null;
  }

  // Create rate limiter with sliding window algorithm
  const config = RATE_LIMIT_CONFIG[type];
  const limiter = new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(config.requests, config.window),
    analytics: true,
    prefix: `ratelimit:${type}`,
  });

  rateLimiters.set(type, limiter);
  return limiter;
}

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in milliseconds
  pending: Promise<unknown>; // Analytics promise (can be ignored)
}

/**
 * Check rate limit for an identifier (IP address or user ID)
 * Returns success/failure with limit info
 */
export async function checkRateLimit(
  identifier: string,
  type: RateLimitType
): Promise<RateLimitResult> {
  const limiter = getRateLimiter(type);

  // If KV is not available, allow the request (graceful degradation)
  if (!limiter) {
    const config = RATE_LIMIT_CONFIG[type];
    return {
      success: true,
      limit: config.requests,
      remaining: config.requests,
      reset: Date.now() + 60_000, // 1 minute from now
      pending: Promise.resolve(),
    };
  }

  try {
    // Check rate limit
    const result = await limiter.limit(identifier);

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      pending: result.pending,
    };
  } catch (error) {
    // Log error but fail open (allow request) to prevent KV outages from breaking the app
    console.error(
      `[rate-limit] Error checking rate limit for ${type}:`,
      error instanceof Error ? error.message : String(error)
    );

    const config = RATE_LIMIT_CONFIG[type];
    return {
      success: true, // Fail open
      limit: config.requests,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    };
  }
}

/**
 * Get identifier from request
 * Prefers user ID for authenticated requests, falls back to IP address
 */
export function getIdentifier(
  ip: string | null,
  userId?: string | null
): string {
  // Use user ID if available (more accurate for authenticated users)
  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP address
  return `ip:${ip || 'unknown'}`;
}

/**
 * Extract IP address from request headers
 * Checks common headers used by proxies and load balancers
 */
export function getClientIP(headers: Headers): string | null {
  // Try common headers in order of preference
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list, take the first IP
    return forwarded.split(',')[0].trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  // No IP found
  return null;
}
