import { createMiddleware } from 'hono/factory';
import { getCookie, deleteCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { z } from 'zod';
import type { Env } from '@/types';
import { getDb, users } from '@/lib/db';
import { eq } from 'drizzle-orm';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

// Zod schema for JWT session payload
export const JWTSessionPayloadSchema = z.object({
  userId: z.string(),
  exp: z.number(),
});

export type JWTSessionPayload = z.infer<typeof JWTSessionPayloadSchema>;

type Variables = {
  user?: AuthUser;
};

/**
 * Middleware to check if user is authenticated via JWT
 * Verifies JWT signature then fetches current user data from DB
 * This ensures we have fresh user info (admin status, etc)
 */
export const auth = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const token = getCookie(c, 'session');

    if (!token) {
      await next();
      return;
    }

    try {
      // 1. Verify JWT signature and expiry (fast, no DB)
      const rawPayload = await verify(token, c.env.JWT_SECRET);

      // 2. Validate payload structure with Zod
      const parseResult = JWTSessionPayloadSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        // Invalid payload structure - delete cookie
        console.debug('Invalid JWT payload structure:', parseResult.error);
        deleteCookie(c, 'session');
        await next();
        return;
      }

      const payload = parseResult.data;

      // 3. Look up current user data from DB (ensures user still exists, gets fresh admin status)
      const db = getDb(c.env.DB);
      let user;
      try {
        [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, payload.userId))
          .limit(1);
      } catch (dbError) {
        // Database error - log and treat as unauthenticated
        console.error('Database error during auth lookup:', dbError instanceof Error ? dbError.message : String(dbError));
        deleteCookie(c, 'session');
        await next();
        return;
      }

      if (!user) {
        // User was deleted - token is invalid, delete cookie
        console.debug('User not found for JWT session, deleting cookie');
        deleteCookie(c, 'session');
        await next();
        return;
      }

      // Set user in context with fresh data from DB
      c.set('user', {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: Boolean(user.isAdmin),
      });
    } catch (error) {
      // Invalid or expired token - delete cookie and continue as unauthenticated
      console.debug('Invalid JWT token:', error instanceof Error ? error.message : String(error));
      deleteCookie(c, 'session');
    }

    await next();
  }
);

/**
 * Middleware to require authentication
 */
export const requireAuth = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.redirect('/login');
    }

    await next();
  }
);

/**
 * Middleware to require admin privileges
 */
export const requireAdmin = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const user = c.get('user');

    if (!user) {
      // Return JSON error for API requests, redirect for HTML requests
      const accept = c.req.header('Accept') || '';
      if (accept.includes('application/json') || c.req.path.startsWith('/api/')) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      return c.redirect('/login');
    }

    if (!user.isAdmin) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    await next();
  }
);
