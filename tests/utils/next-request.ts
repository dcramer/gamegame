import type { NextRequest } from 'next/server';

/**
 * Utility to create a NextRequest-compatible object for route handler tests.
 * We only need the standard Request shape, so a type assertion is sufficient.
 */
export function createNextRequest(
  input: string | URL,
  init?: RequestInit
): NextRequest {
  return new Request(input, init) as unknown as NextRequest;
}

export function createRouteContext<T>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
