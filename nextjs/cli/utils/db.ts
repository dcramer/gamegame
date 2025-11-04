import { db } from '@/lib/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';

/**
 * Get database connection for CLI commands
 * Supports optional production database URL
 */
export function getDatabase(productionUrl?: string) {
  if (productionUrl) {
    const client = postgres(productionUrl);
    return drizzle(client, { schema });
  }
  return db;
}
