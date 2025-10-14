import { kv } from "@vercel/kv";
import { type Duration, Ratelimit } from "@upstash/ratelimit";
import { env } from "@/lib/env.mjs";
import { logger } from "@/lib/logger";

export class FauxRateLimiter {
  limit() {
    return {
      limit: 10,
      remaining: 10,
      reset: new Date(),
    };
  }
}

export function getRateLimiter(tokens: number, window: Duration) {
  if (!env.KV_REST_API_TOKEN) {
    logger.warn(
      { tokens, window },
      "No KV_REST_API_TOKEN found, rate limiting disabled (FauxRateLimiter in use)"
    );
    return new FauxRateLimiter();
  }
  return new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(tokens, window),
  });
}
