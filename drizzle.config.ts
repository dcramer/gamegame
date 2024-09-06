import type { Config } from "drizzle-kit";
import { env } from "@/lib/env.mjs";

export default {
  schema: "./lib/db/schema",
  dialect: "postgresql",
  out: "./lib/db/migrations",
  dbCredentials: {
    url:
      env.POSTGRES_URL ||
      env.DATABASE_URL ||
      "postgres://postgres:postgres@localhost:5432/postgres",
  },
} satisfies Config;
