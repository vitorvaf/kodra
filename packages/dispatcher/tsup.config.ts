import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  dts: true,
  sourcemap: true,
  clean: true,
  // Copy the preview-proxy injection assets (Eruda, eruda-init, inspect) into
  // dist/ so the runtime can read them next to the compiled JS.
  async onSuccess() {
    const src = resolve(process.cwd(), 'assets');
    const dest = resolve(process.cwd(), 'dist', 'assets');
    await cp(src, dest, { recursive: true });
  },
});
