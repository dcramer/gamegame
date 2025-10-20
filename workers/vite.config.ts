import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname, 'client'),
  plugins: [
    react(),
    cloudflare({
      // Persist bindings data across restarts - use root .wrangler/state directory
      persistState: { path: resolve(__dirname, './.wrangler/state') },
      configPath: resolve(__dirname, './wrangler.toml'),
    }),
  ],
  server: {
    port: 4000,
    strictPort: true, // Fail if port is already in use
  },
  build: {
    outDir: resolve(__dirname, './dist'),
  },
  resolve: {
    conditions: ['browser'],
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {},
  },
  esbuild: {
    // Override tsconfig.json's jsxImportSource for client build
    jsxImportSource: 'react',
    jsx: 'automatic',
  },
});
