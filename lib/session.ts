/**
 * Session management using JWT tokens
 * Tokens stored in httpOnly cookies (no database sessions table)
 * User data is embedded in JWT payload for performance
 */

import { cookies } from 'next/headers';
import { cache } from 'react';
import { db } from './db';
import { users } from './db/schema/users';
import { eq } from 'drizzle-orm';
import { signJWT, verifyJWT, type JWTTokenPayload } from './auth/jwt';

/**
 * Session data stored in JWT token
 */
export interface SessionData {
  userId: string;
  email: string;
  isAdmin: boolean;
}

/**
 * Full user data (alias for SessionData for backward compatibility)
 */
export interface UserData {
  userId: string;
  email: string;
  isAdmin: boolean;
}

const COOKIE_NAME = 'gamegame_session';
const COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: '/',
};

/**
 * Get the JWT token from cookie
 */
async function getTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value || null;
}

/**
 * Set the JWT token in cookie
 */
async function setTokenInCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, COOKIE_OPTIONS);
}

/**
 * Delete the JWT token cookie
 */
async function deleteTokenCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Get the current session data from JWT token
 * Returns null if no token or token is invalid/expired
 */
export async function getSession(): Promise<SessionData | null> {
  const token = await getTokenFromCookie();
  if (!token) return null;

  const payload = await verifyJWT(token);
  if (!payload) return null;

  return {
    userId: payload.userId,
    email: payload.email,
    isAdmin: payload.isAdmin,
  };
}

/**
 * Get user data from database (cached per-request to avoid duplicate queries)
 * Uses React's cache() to dedupe within a single request
 * Used for fresh data verification when needed
 */
const getUserFromDb = cache(async (userId: string): Promise<UserData | null> => {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    isAdmin: user.isAdmin === 1, // Convert integer to boolean
  };
});

/**
 * Get current authenticated user data from JWT token
 * Returns null if not authenticated or token invalid/expired
 * Note: This returns data from the JWT token, not fresh from database
 * For fresh data, use getUserFromDb() directly
 */
export async function getCurrentUser(): Promise<UserData | null> {
  return getSession();
}

/**
 * Cached session verifier for Data Access Layer (DAL) pattern
 * Uses React's cache() to dedupe calls within a single request
 * Returns null if not authenticated
 *
 * This is the recommended function for auth checks in components that
 * need to be non-blocking and streaming-friendly.
 */
export const verifySession = cache(async (): Promise<UserData | null> => {
  return getSession();
});

/**
 * Cached admin session verifier for Data Access Layer (DAL) pattern
 * Uses React's cache() to dedupe calls within a single request
 * Throws if not authenticated or not admin
 *
 * This is the recommended function for admin-only components that
 * need to be non-blocking and streaming-friendly.
 */
export const verifyAdminSession = cache(async (): Promise<UserData> => {
  const user = await verifySession();
  if (!user) {
    throw new Error('Unauthorized');
  }
  if (!user.isAdmin) {
    throw new Error('Forbidden: Admin access required');
  }
  return user;
});

/**
 * Create a new session for a user (generates JWT and sets cookie)
 */
export async function createSession(userId: string): Promise<void> {
  // Fetch user data from database to create JWT
  const user = await getUserFromDb(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const token = await signJWT({
    userId: user.userId,
    email: user.email,
    isAdmin: user.isAdmin,
  });

  await setTokenInCookie(token);
}

/**
 * Destroy the current session
 */
export async function destroySession(): Promise<void> {
  await deleteTokenCookie();
}

/**
 * Check if user is authenticated (has valid JWT token)
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
}

/**
 * Check if user is admin
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.isAdmin === true;
}

/**
 * Get current user ID from session, or null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.userId || null;
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<UserData> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

/**
 * Require admin - throws if not admin
 */
export async function requireAdmin(): Promise<UserData> {
  const user = await requireAuth();

  if (!user.isAdmin) {
    throw new Error('Forbidden: Admin access required');
  }

  return user;
}

/**
 * Refresh the current session token (issue new token with fresh expiration)
 * Returns true if successful, false if no valid session
 */
export async function refreshSession(): Promise<boolean> {
  const token = await getTokenFromCookie();
  if (!token) return false;

  const payload = await verifyJWT(token);
  if (!payload) return false;

  // Verify user still exists in database
  const user = await getUserFromDb(payload.userId);
  if (!user) return false;

  // Issue new token with fresh data from database
  const newToken = await signJWT({
    userId: user.userId,
    email: user.email,
    isAdmin: user.isAdmin,
  });

  await setTokenInCookie(newToken);
  return true;
}
