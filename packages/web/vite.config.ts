import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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
