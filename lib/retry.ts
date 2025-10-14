import { logger } from "./logger";

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts (default: 3)
   */
  maxRetries?: number;

  /**
   * Initial delay in milliseconds (default: 1000)
   */
  initialDelay?: number;

  /**
   * Maximum delay in milliseconds (default: 10000)
   */
  maxDelay?: number;

  /**
   * Backoff multiplier (default: 2 for exponential backoff)
   */
  backoffMultiplier?: number;

  /**
   * Custom function to determine if error is retryable
   * Returns true to retry, false to fail immediately
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;

  /**
   * Operation name for logging
   */
  operationName?: string;
}

/**
 * Default retry predicate - retries on network errors and 5xx status codes
 */
function defaultShouldRetry(error: unknown, attempt: number): boolean {
  // Don't retry if we've exhausted attempts
  if (attempt >= 3) return false;

  // Network errors are retryable
  if (
    error instanceof Error &&
    (error.message.includes("ECONNRESET") ||
      error.message.includes("ETIMEDOUT") ||
      error.message.includes("ENOTFOUND") ||
      error.message.includes("fetch failed"))
  ) {
    return true;
  }

  // HTTP 5xx errors are retryable (server errors)
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    return status >= 500 && status < 600;
  }

  // HTTP 429 (rate limit) is retryable
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    return status === 429;
  }

  // Don't retry other errors
  return false;
}

/**
 * Execute a function with exponential backoff retry logic
 *
 * @example
 * const result = await withRetry(
 *   () => fetch('https://api.example.com/data'),
 *   { operationName: 'fetch-user-data', maxRetries: 3 }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = defaultShouldRetry,
    operationName = "operation",
  } = options;

  const log = logger.child({
    operation: "withRetry",
    operationName,
    maxRetries,
  });

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        log.info({ attempt }, `Retrying ${operationName}`);
      }
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt < maxRetries && shouldRetry(error, attempt)) {
        // Calculate delay with exponential backoff
        const delay = Math.min(
          initialDelay * Math.pow(backoffMultiplier, attempt),
          maxDelay
        );

        log.warn(
          {
            err: error,
            attempt: attempt + 1,
            maxRetries,
            delayMs: delay,
          },
          `${operationName} failed, retrying after ${delay}ms`
        );

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Don't retry - either exhausted attempts or error is not retryable
        log.error(
          {
            err: error,
            attempt: attempt + 1,
            retriable: shouldRetry(error, attempt),
          },
          `${operationName} failed permanently`
        );
        throw error;
      }
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError;
}
