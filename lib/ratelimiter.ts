import { kv } from "@vercel/kv";
import { type Duration, Ratelimit } from "@upstash/ratelimit";
import { env } from "@/lib/env.mjs";

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
    console.warn(
      "No KV_REST_API_TOKEN found, no rate limits will be enforced."
    );
    return new FauxRateLimiter();
  }
  return new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(tokens, window),
  });
}
