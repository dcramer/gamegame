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
        // Prepared statements: enabled in dev (better performance), disabled in prod (PgBouncer compatibility)
        prepare: process.env.NODE_ENV !== 'production',

        // Connection pool configuration
        // Production: 1 connection (PgBouncer handles pooling)
        // Development: 10 connections (direct to Postgres)
        max: process.env.NODE_ENV === 'production' ? 1 : 10,

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
// Same connection string as main client (no more separate MIGRATION_DATABASE_URL)
const migrationClient =
  process.env.NODE_ENV === 'development' && global.__migrationClient
    ? global.__migrationClient
    : postgres(connectionString, {
        max: 1,
        prepare: false,  // Disable for migrations (some DDL doesn't work with prepared statements)
      });

if (process.env.NODE_ENV === 'development') {
  global.__migrationClient = migrationClient;
}

export { migrationClient };
