import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Environment variable validation
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create PostgreSQL connection
const connectionString = process.env.DATABASE_URL;

// Extend global with our db clients to prevent connection leaks in dev mode
declare global {
  // eslint-disable-next-line no-var
  var __db: postgres.Sql | undefined;
  // eslint-disable-next-line no-var
  var __migrationClient: postgres.Sql | undefined;
}

// For query purposes - cache in global during development to prevent connection leaks
// Next.js hot-reloads modules but global persists across rebuilds
const queryClient =
  process.env.NODE_ENV === 'development' && global.__db
    ? global.__db
    : postgres(connectionString, {
        // CRITICAL: Disable prepared statements for transaction pooling (PgBouncer)
        // Prepared statements don't work with transaction-mode poolers
        prepare: false,

        // Connection pool configuration
        // Keep low since PgBouncer handles the real pooling
        max: process.env.NODE_ENV === 'production' ? 1 : 3,

        // Lifecycle settings - close idle connections quickly
        idle_timeout: 20,           // Close idle connections after 20s
        max_lifetime: 60 * 30,      // Recycle connections after 30 min
        connect_timeout: 10,        // Fail fast if can't connect

        // Connection metadata
        connection: {
          application_name: 'gamegame-nextjs',
        },

        // Development debugging (optional)
        ...(process.env.NODE_ENV === 'development' && process.env.DEBUG_SQL === 'true' ? {
          debug: (connection: number, query: string, params: any[]) => {
            console.log('[SQL Debug]', {
              connection,
              query: query.substring(0, 100),
              paramCount: params?.length || 0,
            });
          },
        } : {}),
      });

if (process.env.NODE_ENV === 'development') {
  global.__db = queryClient;
}

export const db = drizzle(queryClient, { schema });

// For migrations - separate client with single connection
// Migrations need to connect directly to Postgres (port 5434), not through PgBouncer
// because they may use features incompatible with transaction pooling
const migrationConnectionString = process.env.MIGRATION_DATABASE_URL || connectionString;

const migrationClient =
  process.env.NODE_ENV === 'development' && global.__migrationClient
    ? global.__migrationClient
    : postgres(migrationConnectionString, {
        max: 1,
        prepare: false,  // Also disable for migrations for consistency
      });

if (process.env.NODE_ENV === 'development') {
  global.__migrationClient = migrationClient;
}

export { migrationClient };
