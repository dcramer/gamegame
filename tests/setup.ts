/**
 * Test setup file - runs before each test file
 *
 * This file configures the test environment for all tests:
 * 1. Sets environment variables (DATABASE_URL, API keys, etc.)
 * 2. Mocks NextAuth to bypass authentication
 * 3. Sets up global test cleanup
 *
 * IMPORTANT: Environment variables must be set BEFORE any other imports
 */

// Set up test environment variables FIRST
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/test_gamegame';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.MISTRAL_API_KEY = 'test-mistral-key';
process.env.AUTH_SECRET = 'test-auth-secret';
process.env.AUTH_RESEND_KEY = 'test-resend-key';
process.env.SESSION_SECRET = 'test-session-secret-must-be-at-least-32-characters-long';
process.env.BGG_API_KEY = 'test-bgg-key';

// Now import vitest after env vars are set
import { beforeAll, afterEach, vi } from 'vitest';
import { cleanupTestDb, setupTestDb } from './db-helpers';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/test_gamegame';
const SKIP_DB_TESTS = process.env.SKIP_DB_TESTS === '1';
let testDbReady = false;

beforeAll(async () => {
  if (SKIP_DB_TESTS) {
    console.warn('[tests] SKIP_DB_TESTS=1 - database-dependent tests are disabled.');
    return;
  }

  try {
    await setupTestDb();
    await cleanupTestDb(); // Ensure a clean slate before the first test runs
    testDbReady = true;
  } catch (error) {
    const hint = [
      `Unable to connect to test database at ${TEST_DATABASE_URL}.`,
      'Start Postgres with `docker-compose up -d` (per CLAUDE.md) or update DATABASE_URL to a reachable instance.',
    ].join(' ');
    console.error(hint);
    throw new Error(hint, { cause: error });
  }
});

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

// Mock session functions to bypass authentication in tests
vi.mock('@/lib/session', () => ({
  getSession: vi.fn(async () => ({
    userId: 'test-admin-id',
    email: 'admin@test.com',
    isAdmin: true,
  })),
  getCurrentUser: vi.fn(async () => ({
    userId: 'test-admin-id',
    email: 'admin@test.com',
    isAdmin: true,
  })),
  getCurrentUserId: vi.fn(async () => 'test-admin-id'),
  isAuthenticated: vi.fn(async () => true),
  isAdmin: vi.fn(async () => true),
  requireAuth: vi.fn(async () => ({
    userId: 'test-admin-id',
    email: 'admin@test.com',
    isAdmin: true,
  })),
  requireAdmin: vi.fn(async () => ({
    userId: 'test-admin-id',
    email: 'admin@test.com',
    isAdmin: true,
  })),
  createSession: vi.fn(async () => {}),
  destroySession: vi.fn(async () => {}),
  refreshSession: vi.fn(async () => true),
}));

// Mock auth helpers (re-exports from session)
vi.mock('@/lib/auth/helpers', () => ({
  requireAdmin: vi.fn(async () => ({
    userId: 'test-admin-id',
    email: 'admin@test.com',
    isAdmin: true,
  })),
  requireAuth: vi.fn(async () => ({
    userId: 'test-admin-id',
    email: 'admin@test.com',
    isAdmin: true,
  })),
  getSession: vi.fn(async () => ({
    userId: 'test-admin-id',
    email: 'admin@test.com',
    isAdmin: true,
  })),
  getCurrentUser: vi.fn(async () => ({
    userId: 'test-admin-id',
    email: 'admin@test.com',
    isAdmin: true,
  })),
  isAuthenticated: vi.fn(async () => true),
  isAdmin: vi.fn(async () => true),
  refreshSession: vi.fn(async () => true),
}));

/**
 * Global cleanup after each test
 *
 * This ensures tests are isolated and don't affect each other.
 * - Cleans database tables (fast DELETE FROM)
 * - Restores all mocked functions
 */
afterEach(async () => {
  // Restore all mocked functions
  vi.restoreAllMocks();

  if (!testDbReady || SKIP_DB_TESTS) {
    return;
  }

  try {
    // Clean database between tests for isolation
    await cleanupTestDb();
  } catch (error) {
    console.error(
      '[tests] Failed to clean the test database. Confirm Postgres is running and reachable on localhost:5433.'
    );
    throw error;
  }
});
