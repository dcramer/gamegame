/**
 * Rate Limit Handler Utility
 * Provides a reusable wrapper for applying rate limiting to Next.js API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  getClientIP,
  getIdentifier,
  type RateLimitType,
} from '@/lib/services/rate-limit';
import { getCurrentUserId } from '@/lib/session';

/**
 * Apply rate limiting to a Next.js API route handler
 *
 * @param request - Next.js request object
 * @param type - Rate limit type (determines limits)
 * @param handler - Route handler function to execute if rate limit passes
 * @returns Response from handler or 429 if rate limited
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   return withRateLimit(request, 'chat', async () => {
 *     // Your route handler logic here
 *     return NextResponse.json({ success: true });
 *   });
 * }
 */
export async function withRateLimit(
  request: NextRequest,
  type: RateLimitType,
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    // Get client IP from headers
    const ip = getClientIP(request.headers);

    // Get user ID from session if authenticated
    const userId = await getCurrentUserId();

    // Create identifier for rate limiting
    const identifier = getIdentifier(ip, userId);

    // Check rate limit
    const result = await checkRateLimit(identifier, type);

    // Add rate limit headers to response
    const headers = new Headers({
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.reset.toString(),
    });

    // If rate limit exceeded, return 429
    if (!result.success) {
      // Calculate retry-after in seconds
      const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);

      headers.set('Retry-After', retryAfter.toString());

      // Log rate limit violation
      console.warn(
        `[rate-limit] Rate limit exceeded for ${type}`,
        {
          identifier,
          ip,
          userId,
          limit: result.limit,
        }
      );

      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again in ${retryAfter} seconds.`,
          retryAfter,
        },
        {
          status: 429,
          headers,
        }
      );
    }

    // Execute the handler
    const response = await handler();

    // Add rate limit headers to successful response
    // Clone the response to add headers (Response objects are immutable)
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });

    headers.forEach((value, key) => {
      newResponse.headers.set(key, value);
    });

    return newResponse;
  } catch (error) {
    console.error(
      `[rate-limit] Error in rate limit handler for ${type}:`,
      error instanceof Error ? error.message : String(error)
    );

    // On error, execute handler anyway (fail open)
    return handler();
  }
}

/**
 * Helper to add rate limit headers to an existing response
 * Useful when you want to manually check rate limits
 */
export function addRateLimitHeaders(
  response: Response,
  limit: number,
  remaining: number,
  reset: number
): Response {
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });

  newResponse.headers.set('X-RateLimit-Limit', limit.toString());
  newResponse.headers.set('X-RateLimit-Remaining', remaining.toString());
  newResponse.headers.set('X-RateLimit-Reset', reset.toString());

  return newResponse;
}
