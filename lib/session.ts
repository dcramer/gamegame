/**
 * Session management using iron-session
 * Encrypted cookie-based sessions (no database sessions table)
 * User data is fetched from database on each request for security and freshness
 */

import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { db } from './db';
import { users } from './db/schema/users';
import { eq } from 'drizzle-orm';

/**
 * Minimal session data stored in encrypted cookie
 */
export interface SessionData {
  userId: string;
}

/**
 * Full user data fetched from database
 */
export interface UserData {
  userId: string;
  email: string;
  isAdmin: boolean;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'gamegame_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

/**
 * Get the current session
 */
export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/**
 * Get user data from database (cached per-request to avoid duplicate queries)
 * Uses React's cache() to dedupe within a single request
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
 * Get current authenticated user data from database
 * Returns null if not authenticated or user not found in database
 */
export async function getCurrentUser(): Promise<UserData | null> {
  const session = await getSession();
  if (!session.userId) return null;

  return getUserFromDb(session.userId);
}

/**
 * Create a new session for a user (only stores userId in cookie)
 */
export async function createSession(userId: string) {
  const session = await getSession();
  session.userId = userId;
  await session.save();
}

/**
 * Destroy the current session
 */
export async function destroySession() {
  const session = await getSession();
  session.destroy();
}

/**
 * Check if user is authenticated (has valid session with existing user in database)
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
  return session.userId || null;
}

/**
 * Require authentication - throws if not authenticated or user not found
 * Note: Cannot destroy invalid sessions in Server Components (Next.js 15 restriction)
 */
export async function requireAuth(): Promise<UserData> {
  const user = await getCurrentUser();

  if (!user) {
    // User session exists but user deleted from database
    // Cannot call session.destroy() in Server Components (Next.js 15)
    // The session will remain until it expires or user logs out
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
