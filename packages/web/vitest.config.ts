import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    // Mirror vite.config.ts: the renderer only consumes the browser-safe
    // issue-ref helpers from @kanbots/core, never the Node-only GitHub client.
    alias: {
      '@kanbots/core': fileURLToPath(new URL('../core/src/issue-ref.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
