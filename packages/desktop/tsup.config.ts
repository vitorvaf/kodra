import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { main: 'src/main.ts' },
    format: ['cjs'],
    target: 'node20',
    outExtension: () => ({ js: '.cjs' }),
    platform: 'node',
    bundle: true,
    noExternal: [/^@kanbots\//, /^@octokit\//, 'before-after-hook', 'universal-user-agent'],
    external: ['electron', 'better-sqlite3', 'bindings', 'file-uri-to-path'],
    clean: true,
    sourcemap: false,
    minify: false,
    // The dispatcher's preview proxy serves Eruda + the inspect injector
    // from disk at runtime. Since main.cjs bundles dispatcher inline, those
    // assets aren't reachable via the dispatcher's own dist anymore. Copy
    // them alongside main.cjs so a deterministic, host-supplied path
    // (`__dirname/assets`) resolves at runtime.
    async onSuccess() {
      const src = resolve(process.cwd(), '..', 'dispatcher', 'assets');
      const dest = resolve(process.cwd(), 'dist', 'assets');
      await cp(src, dest, { recursive: true });
    },
  },
  {
    entry: { preload: 'src/preload.ts' },
    format: ['cjs'],
    target: 'node20',
    outExtension: () => ({ js: '.cjs' }),
    platform: 'node',
    external: ['electron'],
    sourcemap: false,
  },
]);
