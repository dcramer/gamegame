import { defineConfig } from 'vitest/config';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: [
      'node_modules',
      '**/node_modules/**',
      'workers/**',
      'dist',
      '.next',
      'tests/examples/**', // Exclude example tests (for documentation only)
    ],
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/mocks/next-server-mock.ts', './tests/setup.ts'],
    fileParallelism: false, // Run test files sequentially to avoid DB conflicts
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/test_gamegame',
      OPENAI_API_KEY: 'test-openai-key',
      MISTRAL_API_KEY: 'test-mistral-key',
      AUTH_SECRET: 'test-auth-secret',
      AUTH_RESEND_KEY: 'test-resend-key',
      SESSION_SECRET: 'test-session-secret-32-chars-minimum',
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
