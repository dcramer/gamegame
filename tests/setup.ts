// Test setup file - runs BEFORE imports
// Sets minimal environment variables required for tests

// Set minimal required env vars for tests
// These must be set BEFORE any imports happen
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost:5433/test";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret";
process.env.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "test-mistral-key";
// NODE_ENV is read-only in production builds, so we don't set it here
