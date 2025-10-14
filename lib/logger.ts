import pino from "pino";
import { env } from "./env.mjs";

/**
 * Structured logger using Pino
 *
 * Features:
 * - Structured JSON logging in production
 * - Pretty printing in development
 * - Context-aware logging
 * - Performance optimized
 *
 * Usage:
 * ```ts
 * import { logger } from "@/lib/logger";
 *
 * logger.info("User logged in", { userId: "123" });
 * logger.error({ err: error, userId: "123" }, "Failed to process request");
 * logger.child({ requestId: "abc" }).info("Processing request");
 * ```
 */
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",

  // Note: pino-pretty transport using worker threads doesn't work with Next.js
  // Use JSON output in all environments. For pretty printing in dev, pipe to pino-pretty CLI:
  // pnpm dev 2>&1 | pnpm exec pino-pretty

  // Base fields for all logs
  base: {
    env: env.NODE_ENV,
  },

  // Redact sensitive fields
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.apiKey",
      "*.secret",
      "*.authorization",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    remove: true,
  },

  // Serialize errors properly
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

/**
 * Create a child logger with additional context
 *
 * @example
 * const log = createLogger({ module: "pdf-processor", resourceId: "123" });
 * log.info("Starting PDF processing");
 */
export function createLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

/**
 * Log timing information for performance monitoring
 *
 * @example
 * const end = logger.time("pdf-extraction");
 * // ... do work ...
 * end({ pages: 42, success: true });
 */
export function logTiming(operation: string) {
  const start = Date.now();
  return (metadata?: Record<string, unknown>) => {
    const duration = Date.now() - start;
    logger.info(
      {
        operation,
        duration,
        ...metadata,
      },
      `${operation} completed in ${duration}ms`
    );
  };
}

/**
 * Helper to log and throw errors
 * Logs the error with context, then throws it
 *
 * @example
 * throw logAndThrow(new Error("Invalid input"), { userId: "123", input });
 */
export function logAndThrow(
  error: Error,
  context?: Record<string, unknown>
): never {
  logger.error({ err: error, ...context }, error.message);
  throw error;
}
