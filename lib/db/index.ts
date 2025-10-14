import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env.mjs";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";

// Configure pool for serverless environment (Vercel Fluid Compute)
// Vercel's Fluid Compute can reuse connections across concurrent requests
// in the same instance, so we use attachDatabasePool to properly handle
// idle connections and prevent connection leaks
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 1, // Limit to 1 connection per serverless function instance
  idleTimeoutMillis: 10000, // Close idle connections after 10 seconds
  connectionTimeoutMillis: 10000, // Timeout connection attempts after 10 seconds
});

// Attach pool to handle idle connections properly in Fluid Compute
// This prevents connection leaks when functions are suspended
attachDatabasePool(pool);

export const db = drizzle(pool, {
  schema,
});
