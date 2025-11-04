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

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
});
