import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'path';

export default defineWorkersConfig(async () => {
  // Read D1 migrations from filesystem (Node.js context)
  const migrations = await readD1Migrations(path.join(__dirname, 'drizzle'));

  return {
    test: {
      include: ['src/**/*.test.ts'],
      setupFiles: ['./src/test-utils/apply-migrations.ts'],
      poolOptions: {
        workers: {
          main: './src/index.test.tsx', // Use test entry point without queue consumer
          miniflare: {
            // Use in-memory D1 for tests
            d1Databases: ['DB'],
            // Use in-memory KV for tests
            kvNamespaces: ['JOB_STATUS_KV', 'RATE_LIMIT_KV'],
            // Enable Node.js compat for uuid and other Node packages
            compatibilityFlags: ['nodejs_compat'],
            compatibilityDate: '2025-01-15',
            // Pass migrations to Worker context as binding
            bindings: {
              TEST_MIGRATIONS: migrations,
              JWT_SECRET: 'test-jwt-secret-for-testing-only',
            },
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
