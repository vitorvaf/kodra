import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The package root also exports Node-only GitHub client code. The web
    // renderer only needs the browser-safe issue-ref helpers.
    alias: {
      '@kanbots/core': fileURLToPath(new URL('../core/src/issue-ref.ts', import.meta.url)),
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
