import type { Env } from './types';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare module 'cloudflare:test' {
  // Extend ProvidedEnv with your Env interface and test-specific bindings
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[]; // Migration array passed from vitest config
  }
}
