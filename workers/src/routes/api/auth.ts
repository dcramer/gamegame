import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';
import type { Env } from '@/types';
import type { AuthUser } from '@/middleware/auth';
import { getDb, users } from '@/lib/db';
import { eq } from 'drizzle-orm';

type Variables = {
  user?: AuthUser;
};

const authRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Request magic link via email
 */
authRouter.post(
  '/login',
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
    })
  ),
  async (c) => {
    const { email } = c.req.valid('json');

    // Create JWT token (15 min expiry)
    const expiryMinutes = 15;
    const token = await sign(
      {
        email,
        exp: Math.floor(Date.now() / 1000) + expiryMinutes * 60,
      },
      c.env.JWT_SECRET
    );

    // Build login URL
    const baseUrl = new URL(c.req.url).origin;
    const loginUrl = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

    // Send email using configured provider
    const { createEmailProvider, generateMagicLinkEmail } = await import('@/lib/services/email');

    const emailProvider = createEmailProvider(c.env.RESEND_API_KEY, c.env.ENVIRONMENT);

    const result = await emailProvider.send({
      to: email,
      subject: 'Login to GameGame',
      html: generateMagicLinkEmail(loginUrl, expiryMinutes),
    });

    if (!result.success) {
      console.error('Failed to send magic link email:', result.error);
      // In development, still return the URL for CLI access
      if (c.env.ENVIRONMENT === 'development') {
        return c.json({
          success: true,
          message: 'Development mode: Use the CLI command `pnpm cli login-url <email>` or check console logs',
          devLoginUrl: loginUrl, // Only in dev mode
        });
      }
      return c.json({ error: 'Failed to send login email. Please try again.' }, 500);
    }

    return c.json({
      success: true,
      message: 'Check your email for the login link',
    });
  }
);

/**
 * Verify magic link token and create JWT session
 */
authRouter.get('/verify', async (c) => {
  const magicToken = c.req.query('token');

  if (!magicToken) {
    return c.json({ error: 'Missing token' }, 400);
  }

  try {
    // Verify magic link JWT
    const payload = await verify(magicToken, c.env.JWT_SECRET);
    const email = payload.email as string;

    if (!email) {
      return c.json({ error: 'Invalid token' }, 400);
    }

    const db = getDb(c.env.DB);

    // Find or create user
    let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          email,
          name: email.split('@')[0],
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    }

    // Create JWT session token (30 days)
    // Only store userId - other data fetched fresh from DB on each request
    const sessionToken = await sign(
      {
        userId: user.id,
        exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
      },
      c.env.JWT_SECRET
    );

    // Set JWT session cookie
    setCookie(c, 'session', sessionToken, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      secure: c.env.ENVIRONMENT === 'production',
      sameSite: 'Lax',
      path: '/',
    });

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error('Token verification failed:', error);
    return c.json({ error: 'Invalid or expired token' }, 400);
  }
});

/**
 * Logout - clear JWT session cookie (GET for browser redirects)
 * JWT will expire naturally, no database cleanup needed
 */
authRouter.get('/logout', async (c) => {
  deleteCookie(c, 'session');
  return c.redirect('/login');
});

/**
 * Logout - clear JWT session cookie (POST for API clients)
 * JWT will expire naturally, no database cleanup needed
 */
authRouter.post('/logout', async (c) => {
  deleteCookie(c, 'session');
  return c.json({ success: true, message: 'Logged out successfully' });
});

/**
 * Get current user
 */
authRouter.get('/me', async (c) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  return c.json(user);
});

export default authRouter;
