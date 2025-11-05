/**
 * Auth helper utilities
 */

import { auth } from '@/auth';
import { cache } from 'react';

/**
 * Get the current session (cached per request)
 */
export const getSession = cache(async () => {
  return await auth();
});

/**
 * Get the current user from session
 */
export const getCurrentUser = async () => {
  const session = await getSession();
  return session?.user ?? null;
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = async () => {
  const user = await getCurrentUser();
  return !!user;
};

/**
 * Check if current user is admin
 */
export const isAdmin = async () => {
  const session = await getSession();
  return session?.user?.isAdmin === true;
};

/**
 * Require authentication - throws if not authenticated
 */
export const requireAuth = async () => {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
};

/**
 * Require admin - throws if not admin
 */
export const requireAdmin = async () => {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    throw new Error('Admin access required');
  }
  return session.user;
};
