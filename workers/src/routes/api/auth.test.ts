import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import { setupTestDb, cleanupTestDb } from '@/test-utils/setup';
import { getDb, users } from '@/lib/db';
import { eq } from 'drizzle-orm';

describe('Auth API Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('POST /api/auth/login', () => {
    it('should accept valid email and return success', async () => {
      const response = await SELF.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.message).toContain('email');
    });

    it('should successfully process login request', async () => {
      const response = await SELF.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dev@example.com' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      // devLoginUrl is only returned when email sending fails in development mode
      // In tests, the email provider may succeed (console log mode) or fail
      // Either way, the endpoint should return success
    });

    it('should reject invalid email format', async () => {
      const response = await SELF.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject missing email', async () => {
      const response = await SELF.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/auth/verify', () => {
    it('should verify valid magic link token and create new user', async () => {
      const email = 'newuser@example.com';

      // Create a valid magic link token
      const magicToken = await sign(
        {
          email,
          exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 min from now
        },
        env.JWT_SECRET
      );

      const response = await SELF.fetch(
        `http://localhost/api/auth/verify?token=${encodeURIComponent(magicToken)}`
      );

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.success).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(email);
      expect(data.user.name).toBe('newuser'); // Derived from email
      expect(data.user.isAdmin).toBe(false);

      // Verify session cookie was set
      const cookies = response.headers.get('set-cookie');
      expect(cookies).toContain('session=');
      expect(cookies).toContain('HttpOnly');
      expect(cookies).toContain('Path=/');

      // Verify user was created in database
      const db = getDb(env.DB);
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      expect(user).toBeDefined();
      expect(user.email).toBe(email);
    });

    it('should verify token and return existing user', async () => {
      const email = 'existing@example.com';

      // Create user first
      const db = getDb(env.DB);
      const [existingUser] = await db
        .insert(users)
        .values({
          email,
          name: 'Existing User',
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create valid magic link token
      const magicToken = await sign(
        {
          email,
          exp: Math.floor(Date.now() / 1000) + 15 * 60,
        },
        env.JWT_SECRET
      );

      const response = await SELF.fetch(
        `http://localhost/api/auth/verify?token=${encodeURIComponent(magicToken)}`
      );

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.user.id).toBe(existingUser.id);
      expect(data.user.email).toBe(email);
      expect(data.user.name).toBe('Existing User');
    });

    it('should reject expired magic link token', async () => {
      const expiredToken = await sign(
        {
          email: 'test@example.com',
          exp: Math.floor(Date.now() / 1000) - 60, // Expired 1 min ago
        },
        env.JWT_SECRET
      );

      const response = await SELF.fetch(
        `http://localhost/api/auth/verify?token=${encodeURIComponent(expiredToken)}`
      );

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toContain('Invalid or expired');
    });

    it('should reject token with missing email', async () => {
      const invalidToken = await sign(
        {
          // Missing email field
          exp: Math.floor(Date.now() / 1000) + 15 * 60,
        },
        env.JWT_SECRET
      );

      const response = await SELF.fetch(
        `http://localhost/api/auth/verify?token=${encodeURIComponent(invalidToken)}`
      );

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('Invalid token');
    });

    it('should reject request without token', async () => {
      const response = await SELF.fetch('http://localhost/api/auth/verify');

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('Missing token');
    });

    it('should reject token signed with wrong secret', async () => {
      const wrongToken = await sign(
        {
          email: 'test@example.com',
          exp: Math.floor(Date.now() / 1000) + 15 * 60,
        },
        'wrong-secret-key'
      );

      const response = await SELF.fetch(
        `http://localhost/api/auth/verify?token=${encodeURIComponent(wrongToken)}`
      );

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toContain('Invalid or expired');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user when authenticated', async () => {
      const email = 'testuser@example.com';

      // Create user
      const db = getDb(env.DB);
      const [user] = await db
        .insert(users)
        .values({
          email,
          name: 'Test User',
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create session token
      const sessionToken = await sign(
        {
          userId: user.id,
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
        env.JWT_SECRET
      );

      const response = await SELF.fetch('http://localhost/api/auth/me', {
        headers: {
          Cookie: `session=${sessionToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.id).toBe(user.id);
      expect(data.email).toBe(email);
      expect(data.name).toBe('Test User');
      expect(data.isAdmin).toBe(false);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await SELF.fetch('http://localhost/api/auth/me');

      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 401 with invalid session token', async () => {
      const response = await SELF.fetch('http://localhost/api/auth/me', {
        headers: {
          Cookie: 'session=invalid-token-value',
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 401 when user no longer exists', async () => {
      // Create session token for non-existent user
      const sessionToken = await sign(
        {
          userId: 'deleted-user-id',
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
        env.JWT_SECRET
      );

      const response = await SELF.fetch('http://localhost/api/auth/me', {
        headers: {
          Cookie: `session=${sessionToken}`,
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear session cookie and return success', async () => {
      const response = await SELF.fetch('http://localhost/api/auth/logout', {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.message).toContain('Logged out');

      // Verify session cookie was deleted
      const cookies = response.headers.get('set-cookie');
      expect(cookies).toContain('session=');
      expect(cookies).toContain('Max-Age=0'); // Cookie deletion
    });
  });

  describe('GET /api/auth/logout', () => {
    it('should clear session cookie and redirect to login', async () => {
      const response = await SELF.fetch('http://localhost/api/auth/logout', {
        redirect: 'manual', // Don't follow redirects
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/login');

      // Verify session cookie was deleted
      const cookies = response.headers.get('set-cookie');
      expect(cookies).toContain('session=');
      expect(cookies).toContain('Max-Age=0');
    });
  });

  describe('Auth Middleware', () => {
    it('should set user in context with valid session', async () => {
      const email = 'middleware@example.com';

      // Create user
      const db = getDb(env.DB);
      const [user] = await db
        .insert(users)
        .values({
          email,
          name: 'Middleware Test',
          isAdmin: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create session token
      const sessionToken = await sign(
        {
          userId: user.id,
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
        env.JWT_SECRET
      );

      // Test that /api/auth/me works with the session
      const response = await SELF.fetch('http://localhost/api/auth/me', {
        headers: {
          Cookie: `session=${sessionToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.isAdmin).toBe(true);
    });

    it('should get fresh user data from database on each request', async () => {
      const email = 'freshdata@example.com';

      // Create user
      const db = getDb(env.DB);
      const [user] = await db
        .insert(users)
        .values({
          email,
          name: 'Original Name',
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create session token
      const sessionToken = await sign(
        {
          userId: user.id,
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
        env.JWT_SECRET
      );

      // First request - should get original data
      let response = await SELF.fetch('http://localhost/api/auth/me', {
        headers: {
          Cookie: `session=${sessionToken}`,
        },
      });
      let data = await response.json() as any;
      expect(data.name).toBe('Original Name');
      expect(data.isAdmin).toBe(false);

      // Update user in database
      await db
        .update(users)
        .set({ name: 'Updated Name', isAdmin: true })
        .where(eq(users.id, user.id));

      // Second request with same token - should get fresh data
      response = await SELF.fetch('http://localhost/api/auth/me', {
        headers: {
          Cookie: `session=${sessionToken}`,
        },
      });
      data = await response.json() as any;
      expect(data.name).toBe('Updated Name');
      expect(data.isAdmin).toBe(true); // Fresh admin status
    });
  });

  describe('Admin Middleware', () => {
    it('should allow admin users to access admin endpoints', async () => {
      const email = 'admin@example.com';

      // Create admin user
      const db = getDb(env.DB);
      const [adminUser] = await db
        .insert(users)
        .values({
          email,
          name: 'Admin User',
          isAdmin: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create session token
      const sessionToken = await sign(
        {
          userId: adminUser.id,
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
        env.JWT_SECRET
      );

      // Try to create a game (admin-only endpoint)
      const response = await SELF.fetch('http://localhost/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session=${sessionToken}`,
        },
        body: JSON.stringify({ name: 'Test Game' }),
      });

      expect(response.status).toBe(201); // Allowed
    });

    it('should return 403 for non-admin users', async () => {
      const email = 'user@example.com';

      // Create regular user
      const db = getDb(env.DB);
      const [regularUser] = await db
        .insert(users)
        .values({
          email,
          name: 'Regular User',
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create session token
      const sessionToken = await sign(
        {
          userId: regularUser.id,
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
        env.JWT_SECRET
      );

      // Try to create a game (admin-only endpoint)
      const response = await SELF.fetch('http://localhost/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session=${sessionToken}`,
        },
        body: JSON.stringify({ name: 'Test Game' }),
      });

      expect(response.status).toBe(403); // Forbidden
      const data = await response.json() as any;
      expect(data.error).toBe('Forbidden');
    });
  });
});
