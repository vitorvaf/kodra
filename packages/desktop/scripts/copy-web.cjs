#!/usr/bin/env node
const { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');

const here = __dirname;
const desktopRoot = resolve(here, '..');
const webDist = resolve(desktopRoot, '..', 'web', 'dist');
const target = join(desktopRoot, 'dist', 'web');

if (!existsSync(webDist)) {
  console.error(`[copy-web] expected web build at ${webDist}; run \`pnpm --filter @kanbots/web build\` first.`);
  process.exit(1);
}

if (existsSync(target)) rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(webDist, target, { recursive: true });
console.log(`[copy-web] copied ${webDist} → ${target}`);

// Also stage the app icon next to dist/main.cjs so the runtime can resolve it
// at join(__dirname, 'icon.png') in both dev and packaged builds.
const iconSrc = resolve(desktopRoot, 'build', 'icon.png');
const iconTarget = join(desktopRoot, 'dist', 'icon.png');
if (existsSync(iconSrc)) {
  copyFileSync(iconSrc, iconTarget);
  console.log(`[copy-web] copied ${iconSrc} → ${iconTarget}`);
}
