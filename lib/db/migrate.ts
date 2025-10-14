import { env } from "@/lib/env.mjs";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const runMigrate = async () => {
  // env.DATABASE_URL is now guaranteed to exist (validated in env.mjs)
  // Disable prepared statements for compatibility with Supabase Transaction mode (port 6543)
  // or any other connection pooler that doesn't support prepared statements
  const connection = postgres(env.DATABASE_URL, {
    max: 1,
    prepare: false, // Required for Supabase Transaction mode pooling
  });

  const db = drizzle(connection);

  console.log("⏳ Running migrations...");

  const start = Date.now();

  await migrate(db, { migrationsFolder: "lib/db/migrations" });

  const end = Date.now();

  console.log("✅ Migrations completed in", end - start, "ms");

  // Close the connection before exiting to avoid hanging
  await connection.end();

  process.exit(0);
};

runMigrate().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});
