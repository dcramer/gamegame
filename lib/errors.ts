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
 * Handle oRPC errors properly in Server Components
 *
 * Use this pattern:
 * ```typescript
 * try {
 *   const data = await serverClient.something.get({ id });
 *   return <Component data={data} />;
 * } catch (error) {
 *   handleServerError(error);
 * }
 * ```
 *
 * This will:
 * - Call notFound() for NOT_FOUND errors (returns 404 page)
 * - Rethrow other errors to be caught by error.tsx boundary
 */
export function handleServerError(error: unknown): never {
  // Handle oRPC NOT_FOUND errors as 404s
  if (isORPCError(error, 'NOT_FOUND')) {
    notFound();
  }

  // Rethrow all other errors to be caught by error boundary
  // This includes:
  // - Validation errors (INVALID_INPUT, etc.)
  // - Permission errors (UNAUTHORIZED, FORBIDDEN)
  // - Database errors
  // - Any other unexpected errors
  throw error;
}
