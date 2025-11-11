/**
 * Database helper utilities for testing
 *
 * Philosophy: Use real PostgreSQL in tests, not mocks.
 * All tests run against a separate test database (test_gamegame on port 5433).
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

/**
 * Verify test database connection
 *
 * Logs database name and connection status.
 * Call this in beforeAll to ensure test database is available.
 *
 * @example
 * beforeAll(async () => {
 *   await setupTestDb();
 * });
 */
export async function setupTestDb(): Promise<void> {
  try {
    // Test connection and get database name
    const result = await db.execute(sql`SELECT current_database()`);
    const dbName = (result[0] as any).current_database;

    // Verify it's the test database
    if (!dbName.includes('test')) {
      throw new Error(`Expected test database, got: ${dbName}`);
    }
  } catch (error) {
    console.error('✗ Failed to connect to test database:', error);
    throw error;
  }
}

/**
 * Clean all tables (DELETE FROM)
 *
 * Fast cleanup between tests - removes all data but preserves sequences.
 * Handles foreign key constraints by deleting in correct order.
 *
 * Use this in afterEach for isolated tests.
 *
 * @example
 * afterEach(async () => {
 *   await cleanupTestDb();
 * });
 */
export async function cleanupTestDb(): Promise<void> {
  // Delete in order to respect foreign key constraints
  // Order: children first, then parents
  await db.execute(sql`DELETE FROM fragments`);
  await db.execute(sql`DELETE FROM embeddings`);
  await db.execute(sql`DELETE FROM attachments`);
  await db.execute(sql`DELETE FROM resources`);
  await db.execute(sql`DELETE FROM bgg_games`);
  await db.execute(sql`DELETE FROM games`);
  await db.execute(sql`DELETE FROM verification_tokens`);
  await db.execute(sql`DELETE FROM users`);
}

/**
 * Full database reset including sequences (TRUNCATE CASCADE)
 *
 * Slower than cleanupTestDb but resets auto-increment sequences.
 * Use when you need a completely fresh state or predictable IDs.
 *
 * Use sparingly - prefer cleanupTestDb for most cases.
 *
 * @example
 * beforeAll(async () => {
 *   await resetTestDb();
 * });
 */
export async function resetTestDb(): Promise<void> {
  // TRUNCATE removes all data and resets sequences
  // CASCADE automatically truncates dependent tables
  await db.execute(sql`TRUNCATE TABLE
    users,
    verification_tokens,
    games,
    bgg_games,
    resources,
    attachments,
    embeddings,
    fragments
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Get row count for a table (useful for debugging)
 *
 * @example
 * const count = await getTableCount('games');
 * console.log(`Games table has ${count} rows`);
 */
export async function getTableCount(tableName: string): Promise<number> {
  const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${tableName}`));
  return Number((result[0] as any).count);
}

/**
 * Check if database is empty (useful for test validation)
 *
 * @example
 * beforeEach(async () => {
 *   const isEmpty = await isDatabaseEmpty();
 *   if (!isEmpty) {
 *     throw new Error('Database not cleaned between tests!');
 *   }
 * });
 */
export async function isDatabaseEmpty(): Promise<boolean> {
  const tables = [
    'users', 'games', 'resources', 'attachments', 'fragments',
    'bgg_games', 'verification_tokens'
  ];

  for (const table of tables) {
    const count = await getTableCount(table);
    if (count > 0) {
      return false;
    }
  }

  return true;
}
