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
    const key = `ratelimit:${ip}`;

    const kv = c.env.RATE_LIMIT_KV;

    // Get current count
    const current = await kv.get(key);
    const count = current ? parseInt(current) : 0;

    // Check if rate limit exceeded
    if (count >= requests) {
      return c.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': requests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': windowSeconds.toString(),
          },
        }
      );
    }

    // Increment counter
    // KV requires minimum TTL of 60 seconds
    await kv.put(key, (count + 1).toString(), {
      expirationTtl: Math.max(windowSeconds, 60),
    });

    // Add rate limit headers
    c.header('X-RateLimit-Limit', requests.toString());
    c.header('X-RateLimit-Remaining', (requests - count - 1).toString());
    c.header('X-RateLimit-Reset', windowSeconds.toString());

    await next();
  });
}
