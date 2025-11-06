/**
 * Auth helper utilities
 * Re-exports from lib/session.ts for backwards compatibility
 */

export {
  getSession,
  getCurrentUser,
  getCurrentUserId,
  isAuthenticated,
  isAdmin,
  requireAuth,
  requireAdmin,
  createSession,
  destroySession,
  refreshSession,
  type SessionData,
  type UserData,
} from '@/lib/session';
