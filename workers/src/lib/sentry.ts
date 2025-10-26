import * as Sentry from "@sentry/cloudflare";

/**
 * Sentry utilities for Cloudflare Workers
 *
 * NOTE: Sentry is initialized via withSentry() wrapper in worker.ts
 * These are utility functions for adding tags, context, and custom spans
 */

/**
 * Start a child span within the current transaction
 * @param name - Span name (e.g., "search_resources")
 * @param op - Operation type (e.g., "ai.tool.call")
 * @param callback - Async function to execute within the span
 * @returns Result of callback
 */
export async function withSpan<T>(
  name: string,
  op: string,
  callback: (span: Sentry.Span | undefined) => Promise<T>
): Promise<T> {
  return Sentry.startSpan({ name, op }, async (span) => {
    return callback(span);
  });
}

/**
 * Set custom tags on the current transaction/span
 */
export function setTag(key: string, value: string | number | boolean) {
  Sentry.setTag(key, value);
}

/**
 * Set custom context data
 */
export function setContext(name: string, context: Record<string, any>) {
  Sentry.setContext(name, context);
}

/**
 * Capture an exception
 */
export function captureException(error: Error | unknown) {
  Sentry.captureException(error);
}

/**
 * Capture a message
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  Sentry.captureMessage(message, level);
}

/**
 * Helper to measure execution time of a function and record it as a span
 */
export async function measureAsync<T>(
  name: string,
  op: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(name, op, async (span) => {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      // Add measurement data to span
      if (span) {
        span.setAttribute("duration_ms", duration);
      }

      return result;
    } catch (error) {
      if (span) {
        span.setStatus({ code: 2, message: "internal_error" }); // 2 = INTERNAL_ERROR
      }
      throw error;
    }
  });
}
