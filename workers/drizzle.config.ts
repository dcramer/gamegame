import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema/d1.ts',
  out: './drizzle',
  driver: 'd1-http',
  dialect: 'sqlite',
  dbCredentials: {
    wranglerConfigPath: './wrangler.toml',
    dbName: 'gamegame',
  },
} satisfies Config;
