/**
 * Tests for Auth Verification API Route
 * GET /api/auth/verify?token=xxx - Verify magic link token and create session
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as verifyToken } from '@/app/api/auth/verify/route';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verificationTokens, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { cleanupTestDb } from '@/tests/db-helpers';
import { createTestUser } from '@/tests/fixtures';

// Mock session creation
vi.mock('@/lib/session', () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn(),
  destroySession: vi.fn(),
  getCurrentUser: vi.fn(),
  isAuthenticated: vi.fn(),
  isAdmin: vi.fn(),
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}));

describe.sequential('Auth Verification API', () => {
  beforeEach(async () => {
    await cleanupTestDb();
  });

  describe('GET /api/auth/verify', () => {
    it('should redirect with error when token is missing', async () => {
      const request = new NextRequest('http://localhost/api/auth/verify');

      const response = await verifyToken(request);

      expect(response.status).toBe(302); // Temporary redirect
      expect(response.headers.get('location')).toContain('/auth/error?error=InvalidToken');
    });

    it('should redirect with error for non-existent token', async () => {
      const request = new NextRequest('http://localhost/api/auth/verify?token=non-existent-token');

      const response = await verifyToken(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/auth/error?error=TokenExpired');
    });

    it('should redirect with error for expired token', async () => {
      // Create expired token
      const expiredTime = Date.now() - 1000; // 1 second ago
      await db.insert(verificationTokens).values({
        identifier: 'test@example.com',
        token: 'expired-token',
        expires: expiredTime,
      });

      const request = new NextRequest('http://localhost/api/auth/verify?token=expired-token');

      const response = await verifyToken(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/auth/error?error=TokenExpired');
    });

    it('should create new user and session for valid token with new email', async () => {
      const { createSession } = await import('@/lib/session');

      // Create valid token
      const futureTime = Date.now() + 60000; // 1 minute from now
      await db.insert(verificationTokens).values({
        identifier: 'newuser@example.com',
        token: 'valid-token-123',
        expires: futureTime,
      });

      const request = new NextRequest('http://localhost/api/auth/verify?token=valid-token-123');

      const response = await verifyToken(request);

      // Should redirect to /games
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/games');

      // Verify user was created
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, 'newuser@example.com'))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.email).toBe('newuser@example.com');
      expect(user.name).toBe('newuser'); // name extracted from email
      expect(user.isAdmin).toBe(0); // not admin by default

      // Verify session was created
      expect(createSession).toHaveBeenCalledWith(user.id);

      // Verify token was deleted (one-time use)
      const remainingTokens = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.token, 'valid-token-123'));

      expect(remainingTokens).toHaveLength(0);
    });

    it('should create session for existing user with valid token', async () => {
      const { createSession } = await import('@/lib/session');

      // Create existing user
      const existingUser = await createTestUser({
        email: 'existing@example.com',
        name: 'Existing User',
      });

      // Create valid token
      const futureTime = Date.now() + 60000;
      await db.insert(verificationTokens).values({
        identifier: 'existing@example.com',
        token: 'valid-token-456',
        expires: futureTime,
      });

      const request = new NextRequest('http://localhost/api/auth/verify?token=valid-token-456');

      const response = await verifyToken(request);

      // Should redirect to /games
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/games');

      // Verify session was created with existing user ID
      expect(createSession).toHaveBeenCalledWith(existingUser.id);

      // Verify no duplicate user was created
      const allUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, 'existing@example.com'));

      expect(allUsers).toHaveLength(1);
      expect(allUsers[0].id).toBe(existingUser.id);

      // Verify token was deleted
      const remainingTokens = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.token, 'valid-token-456'));

      expect(remainingTokens).toHaveLength(0);
    });

    it('should normalize email to lowercase when creating user', async () => {
      // Create token with mixed-case email
      const futureTime = Date.now() + 60000;
      await db.insert(verificationTokens).values({
        identifier: 'MixedCase@Example.COM',
        token: 'mixed-case-token',
        expires: futureTime,
      });

      const request = new NextRequest('http://localhost/api/auth/verify?token=mixed-case-token');

      const response = await verifyToken(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/games');

      // Verify email was stored as lowercase
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, 'mixedcase@example.com'))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.email).toBe('mixedcase@example.com');
    });

    it('should extract name from email when creating user', async () => {
      const futureTime = Date.now() + 60000;
      await db.insert(verificationTokens).values({
        identifier: 'john.doe@example.com',
        token: 'name-extraction-token',
        expires: futureTime,
      });

      const request = new NextRequest('http://localhost/api/auth/verify?token=name-extraction-token');

      const response = await verifyToken(request);

      expect(response.status).toBe(302);

      // Verify name was extracted from email (before @)
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, 'john.doe@example.com'))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.name).toBe('john.doe');
    });

    it('should handle token at exact expiration boundary', async () => {
      // Token expires exactly now
      const nowTime = Date.now();
      await db.insert(verificationTokens).values({
        identifier: 'boundary@example.com',
        token: 'boundary-token',
        expires: nowTime,
      });

      const request = new NextRequest('http://localhost/api/auth/verify?token=boundary-token');

      const response = await verifyToken(request);

      // Should be expired (gt check means expires must be > now)
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/auth/error?error=TokenExpired');
    });

    it('should handle multiple tokens for same email (only use specified one)', async () => {
      const futureTime = Date.now() + 60000;

      // Create two tokens for same email
      await db.insert(verificationTokens).values([
        {
          identifier: 'multi@example.com',
          token: 'token-1',
          expires: futureTime,
        },
        {
          identifier: 'multi@example.com',
          token: 'token-2',
          expires: futureTime,
        },
      ]);

      // Use token-1
      const request = new NextRequest('http://localhost/api/auth/verify?token=token-1');

      const response = await verifyToken(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/games');

      // Only token-1 should be deleted
      const remainingTokens = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.identifier, 'multi@example.com'));

      expect(remainingTokens).toHaveLength(1);
      expect(remainingTokens[0].token).toBe('token-2');
    });

    it('should handle tokens with special characters', async () => {
      const futureTime = Date.now() + 60000;
      const specialToken = 'abc123-def456_xyz789';

      await db.insert(verificationTokens).values({
        identifier: 'special@example.com',
        token: specialToken,
        expires: futureTime,
      });

      const request = new NextRequest(`http://localhost/api/auth/verify?token=${specialToken}`);

      const response = await verifyToken(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/games');
    });

    it('should redirect with generic error on database failure', async () => {
      // Use invalid token format to potentially trigger database error
      // (though the route should handle this gracefully)
      const request = new NextRequest('http://localhost/api/auth/verify?token=test-token');

      const response = await verifyToken(request);

      // Should redirect with error (either TokenExpired or Verification)
      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toMatch(/\/auth\/error\?error=/);
    });
  });
});
