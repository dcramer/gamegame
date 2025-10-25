import { createMiddleware } from 'hono/factory';
import type { Env } from '@/types';

/**
 * Simple rate limiting middleware using KV
 *
 * @param requests - Number of requests allowed
 * @param windowSeconds - Time window in seconds
 */
export function ratelimit(requests: number, windowSeconds: number) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
    const now = Math.floor(Date.now() / 1000);
    // Round to window boundary for consistent reset times
    const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
    const windowEnd = windowStart + windowSeconds;
    const key = `ratelimit:${ip}:${windowStart}`;

    const kv = c.env.RATE_LIMIT_KV;

    try {
      // Get current count
      const current = await kv.get(key);
      const count = current ? parseInt(current, 10) : 0;

      // Check if rate limit exceeded
      if (count >= requests) {
        return c.json(
          { error: 'Rate limit exceeded' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': requests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': windowEnd.toString(),
            },
          }
        );
      }

      // Increment counter
      // KV requires minimum TTL of 60 seconds, so use larger of window or 60
      const ttl = Math.max(windowSeconds, 60);
      await kv.put(key, (count + 1).toString(), {
        expirationTtl: ttl,
      });

      // Add rate limit headers
      c.header('X-RateLimit-Limit', requests.toString());
      c.header('X-RateLimit-Remaining', (requests - count - 1).toString());
      c.header('X-RateLimit-Reset', windowEnd.toString());

      await next();
    } catch (error) {
      // SECURITY: Fail closed during KV outages
      // This prevents abuse during infrastructure issues
      console.error('Rate limit KV error:', error instanceof Error ? error.message : String(error));
      return c.json(
        { error: 'Service temporarily unavailable' },
        {
          status: 503,
          headers: {
            'Retry-After': '60',
          },
        }
      );
    }
  });
}
