import { drizzle } from 'drizzle-orm/d1';
import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types';
import * as schema from './schema/d1';

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DbClient = ReturnType<typeof getDb>;

/**
 * Execute multiple D1 statements atomically using batch API
 * If any statement fails, all are rolled back
 *
 * @param db D1Database instance
 * @param statements Array of prepared statements
 * @returns Array of results from each statement
 */
export async function executeInTransaction<T = any>(
  db: D1Database,
  statements: D1PreparedStatement[]
): Promise<D1Result<T>[]> {
  return db.batch(statements);
}

export * from './schema/d1';
