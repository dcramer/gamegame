import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import path from 'path';

export default defineWorkersConfig({
  test: {
    include: ['src/**/*.test.ts'],
    poolOptions: {
      workers: {
        main: './src/index.test.tsx', // Use test entry point without queue consumer
        miniflare: {
          // Use in-memory D1 for tests
          d1Databases: ['DB'],
          // Enable Node.js compat for uuid and other Node packages
          compatibilityFlags: ['nodejs_compat'],
          compatibilityDate: '2025-01-15',
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
