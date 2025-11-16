/**
 * Error handling utilities for Next.js App Router
 *
 * Best practices:
 * - Use notFound() for expected cases where a resource doesn't exist (404)
 * - Throw errors for unexpected issues (bugs, validation, permissions, etc.)
 * - Let error boundaries catch and display unexpected errors
 */

import { notFound } from 'next/navigation';

/**
 * Check if an error is an oRPC error with a specific code
 */
export function isORPCError(error: unknown, code?: string): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as any;
  if (!err.code) return false;

  if (code) {
    // Handle case where error.code is an object with a 'code' property
    const errorCode = typeof err.code === 'object' && err.code.code
      ? err.code.code
      : err.code;
    return errorCode === code;
  }

  return true;
}

/**
 * Get error message from oRPC error
 */
export function getORPCErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'An error occurred';

  const err = error as any;

  // Check if error.code is an object with message
  if (typeof err.code === 'object' && err.code.message) {
    return err.code.message;
  }

  // Fallback to error.message
  if (err.message && typeof err.message === 'string') {
    return err.message;
  }

  return 'An error occurred';
}

/**
 * Handle oRPC errors properly in Server Components
 *
 * Use this pattern:
 * ```typescript
 * try {
 *   const data = await serverClient.something.get({ id });
 *   return <Component data={data} />;
 * } catch (error) {
 *   return handleServerError(error);
 * }
 * ```
 *
 * This will:
 * - Call notFound() for NOT_FOUND errors (returns 404 page)
 * - Rethrow a properly formatted error for other cases to be caught by error.tsx boundary
 */
export function handleServerError(error: unknown): never {
  // Handle oRPC NOT_FOUND errors as 404s - these are expected when resources don't exist
  if (isORPCError(error, 'NOT_FOUND')) {
    notFound();
  }

  // For all other errors, extract the message and throw a new Error with it
  // This ensures the error boundary receives a proper Error object with a readable message
  const message = getORPCErrorMessage(error);
  const newError = new Error(message);

  // Preserve original error for debugging
  if (error instanceof Error) {
    newError.stack = error.stack;
    newError.cause = error;
  }

  throw newError;
}
