/**
 * API middleware utilities
 * Authentication, authorization, and rate limiting for API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, requireAuth, requireAdmin } from '@/lib/session';
import type { UserData } from '@/lib/session';

/**
 * API handler with user context
 */
export type AuthenticatedHandler<T = unknown> = (
  request: NextRequest,
  user: UserData,
  context?: T,
) => Promise<Response> | Response;

/**
 * Standard API handler
 */
export type ApiHandler<T = unknown> = (
  request: NextRequest,
  context?: T,
) => Promise<Response> | Response;

/**
 * Error response helper
 */
export function errorResponse(
  message: string,
  status: number,
  code?: string,
  details?: unknown,
): NextResponse {
  const payload: Record<string, unknown> = {
    error: message,
  };

  if (code) {
    payload.code = code;
  }

  if (details !== undefined) {
    payload.details = details;
  }

  return NextResponse.json(payload, { status });
}

/**
 * Success response helper
 */
export function successResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Wrap API handler with authentication requirement
 * Verifies JWT token and attaches user to handler
 */
export function withAuth<T = unknown>(
  handler: AuthenticatedHandler<T>,
): ApiHandler<T> {
  return async (request: NextRequest, context?: T) => {
    try {
      const user = await requireAuth();
      return await handler(request, user, context);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Unauthorized') {
          return errorResponse('Authentication required', 401, 'UNAUTHORIZED');
        }
      }
      console.error('Auth middleware error:', error);
      return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
    }
  };
}

/**
 * Wrap API handler with admin requirement
 * Verifies JWT token and checks admin status
 */
export function withAdmin<T = unknown>(
  handler: AuthenticatedHandler<T>,
): ApiHandler<T> {
  return async (request: NextRequest, context?: T) => {
    try {
      const user = await requireAdmin();
      return await handler(request, user, context);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Unauthorized') {
          return errorResponse('Authentication required', 401, 'UNAUTHORIZED');
        }
        if (error.message.includes('Admin')) {
          return errorResponse('Admin access required', 403, 'FORBIDDEN');
        }
      }
      console.error('Admin middleware error:', error);
      return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
    }
  };
}

/**
 * Wrap API handler with optional authentication
 * Attaches user if authenticated, but doesn't require it
 */
export function withOptionalAuth<T = unknown>(
  handler: (
    request: NextRequest,
    user: UserData | null,
    context?: T,
  ) => Promise<NextResponse> | NextResponse,
): ApiHandler<T> {
  return async (request: NextRequest, context?: T) => {
    try {
      const user = await getCurrentUser();
      return await handler(request, user, context);
    } catch (error) {
      console.error('Optional auth middleware error:', error);
      return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
    }
  };
}

/**
 * Rate limiting wrapper (re-exported from existing implementation)
 */
export { withRateLimit } from '@/lib/utils/rate-limit-handler';
