import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build configuration for React client SPA
// This builds client/ → public/ for the Worker to serve
export default defineConfig({
  root: resolve(__dirname, 'client'),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'public'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './client/src'),
    },
  },
  esbuild: {
    jsxImportSource: 'react',
    jsx: 'automatic',
  },
});
