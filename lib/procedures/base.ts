/**
 * Base oRPC Procedures
 * Provides base procedures with authentication middleware
 */

import * as Sentry from '@sentry/nextjs';
import { os, ORPCError } from '@orpc/server';
import { getCurrentUser } from '@/lib/session';

const sentryMiddleware = os.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

const baseProcedure = os.use(sentryMiddleware);

/**
 * Public procedure - no authentication required
 */
export const publicProcedure = baseProcedure;

/**
 * Authenticated procedure - requires valid user session
 */
export const authedProcedure = baseProcedure.use(async ({ next }) => {
  const user = await getCurrentUser();

  if (!user) {
    throw new ORPCError('UNAUTHORIZED', {
      message: 'You must be logged in to access this resource',
    });
  }

  return next({
    context: { user },
  });
});

/**
 * Admin procedure - requires admin privileges
 */
export const adminProcedure = authedProcedure.use(async ({ context, next }) => {
  if (!context.user.isAdmin) {
    throw new ORPCError('FORBIDDEN', {
      message: 'Admin access required',
    });
  }

  return next({ context });
});
