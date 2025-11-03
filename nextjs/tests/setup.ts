/**
 * Test setup file - runs before each test file
 */

import { beforeEach, afterEach, vi } from 'vitest';

// Set up test environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/gamegame_test';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.MISTRAL_API_KEY = 'test-mistral-key';
process.env.AUTH_SECRET = 'test-auth-secret';
process.env.AUTH_RESEND_KEY = 'test-resend-key';
process.env.NODE_ENV = 'test';

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
});
