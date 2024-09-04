import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env.mjs";
import { Pool } from "pg";
import * as schema from "./schema";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

// const client = postgres(env.DATABASE_URL);

export const db = drizzle(pool, {
  schema,
});
