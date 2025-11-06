/**
 * Base oRPC Procedures
 * Provides base procedures with authentication middleware
 */

import { os, ORPCError } from '@orpc/server';
import { getCurrentUser } from '@/lib/session';

/**
 * Public procedure - no authentication required
 */
export const publicProcedure = os;

/**
 * Authenticated procedure - requires valid user session
 */
export const authedProcedure = os.use(async ({ next }) => {
  const user = await getCurrentUser();

  if (!user) {
    throw new ORPCError({
      code: 'UNAUTHORIZED',
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
    throw new ORPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }

  return next({ context });
});
