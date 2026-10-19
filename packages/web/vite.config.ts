import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The package root also exports Node-only GitHub client code. The web
    // renderer only needs the browser-safe subset (issue-ref helpers and
    // shared limits) exported by core's browser barrel.
    alias: {
      '@kanbots/core': fileURLToPath(new URL('../core/src/browser.ts', import.meta.url)),
    },
  },
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': 'http://127.0.0.1:3737',
      '/healthz': 'http://127.0.0.1:3737',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
