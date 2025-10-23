import { applyD1Migrations, env } from 'cloudflare:test';

/**
 * Setup file that applies Drizzle migrations before tests run
 *
 * This runs once before all tests in the Worker context.
 * applyD1Migrations() is idempotent - it only applies migrations
 * that haven't been applied yet, so it's safe to call multiple times.
 *
 * The TEST_MIGRATIONS binding is populated by readD1Migrations()
 * in vitest.config.ts (Node.js context with filesystem access).
 */
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
