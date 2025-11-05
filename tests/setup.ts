/**
 * Test setup file - runs before each test file
 * IMPORTANT: Environment variables must be set BEFORE any other imports
 */

// Set up test environment variables FIRST
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/test_gamegame';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.MISTRAL_API_KEY = 'test-mistral-key';
process.env.AUTH_SECRET = 'test-auth-secret';
process.env.AUTH_RESEND_KEY = 'test-resend-key';
process.env.NODE_ENV = 'test';

// Now import vitest after env vars are set
import { beforeEach, afterEach, vi } from 'vitest';

// Mock NextAuth to avoid 'next/server' import issues in tests
vi.mock('@/auth', () => ({
  auth: vi.fn(async () => ({
    user: {
      id: 'test-admin-id',
      email: 'admin@test.com',
      isAdmin: true,
    },
  })),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}));

// Mock auth helpers to bypass authentication in tests
vi.mock('@/lib/auth/helpers', () => ({
  requireAdmin: vi.fn(async () => ({
    id: 'test-admin-id',
    email: 'admin@test.com',
    isAdmin: true,
  })),
  requireAuth: vi.fn(async () => ({
    id: 'test-user-id',
    email: 'user@test.com',
    isAdmin: false,
  })),
  getSession: vi.fn(async () => ({
    user: {
      id: 'test-admin-id',
      email: 'admin@test.com',
      isAdmin: true,
    },
  })),
  getCurrentUser: vi.fn(async () => ({
    id: 'test-admin-id',
    email: 'admin@test.com',
    isAdmin: true,
  })),
  isAuthenticated: vi.fn(async () => true),
  isAdmin: vi.fn(async () => true),
}));

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
});
