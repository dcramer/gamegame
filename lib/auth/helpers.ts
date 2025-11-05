/**
 * Auth helper utilities
 * Re-exports from lib/session.ts for backwards compatibility
 */

export {
  getSession,
  getCurrentUserId,
  isAuthenticated,
  isAdmin,
  requireAuth,
  requireAdmin,
  createSession,
  destroySession,
  type SessionData,
} from '@/lib/session';

/**
 * Get the current user from session (backwards compatibility)
 */
export async function getCurrentUser() {
  const session = await import('@/lib/session').then((m) => m.getSession());
  if (!session.userId) return null;

  return {
    id: session.userId,
    email: session.email,
    isAdmin: session.isAdmin,
  };
}
