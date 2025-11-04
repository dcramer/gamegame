import { defineConfig } from 'workflow/config';

export default defineConfig({
  // Externalize Node.js built-ins and database packages
  external: [
    'postgres',
    'drizzle-orm',
    '@vercel/postgres',
    'pg',
    'nanoid',
    'sharp',
    'os',
    'fs',
    'net',
    'tls',
    'stream',
    'crypto',
    'node:crypto',
    'node:fs',
    'node:os',
    'node:net',
    'node:tls',
    'node:stream',
  ],
});
