#!/usr/bin/env node
// kanbots npx launcher
//
// Published via `cd npx-cli && npm publish --access public` after the matching
// GitHub release is tagged and binaries are uploaded. Run `npm pack` first to
// inspect the tarball.
//
// At install time, scripts/postinstall.js downloads the platform binary from
// the GitHub release matching this package's version and unpacks it into
// vendor/. This script just locates that binary and spawns it.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const POSTINSTALL = path.join(ROOT, 'scripts', 'postinstall.js');
const RELEASES_URL = 'https://github.com/leodavinci1/kanbots/releases';

function getPlatformKey() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'win32' && arch === 'x64') return 'win32-x64';
  return null;
}

function resolveBinary(platformKey) {
  // Layout produced by postinstall:
  //   vendor/darwin-arm64/kanbots.app/Contents/MacOS/kanbots
  //   vendor/darwin-x64/kanbots.app/Contents/MacOS/kanbots
  //   vendor/linux-x64/kanbots.AppImage
  //   vendor/win32-x64/kanbots.exe  (the launched app, not the installer)
  const dir = path.join(VENDOR, platformKey);
  if (!fs.existsSync(dir)) return null;

  if (platformKey.startsWith('darwin')) {
    const app = path.join(dir, 'kanbots.app', 'Contents', 'MacOS', 'kanbots');
    return fs.existsSync(app) ? app : null;
  }
  if (platformKey === 'linux-x64') {
    const appimage = path.join(dir, 'kanbots.AppImage');
    return fs.existsSync(appimage) ? appimage : null;
  }
  if (platformKey === 'win32-x64') {
    const exe = path.join(dir, 'kanbots.exe');
    return fs.existsSync(exe) ? exe : null;
  }
  return null;
}

function runPostinstall() {
  // npx sometimes skips postinstall on cache hits; re-run defensively.
  const result = spawnSync(process.execPath, [POSTINSTALL], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  return result.status === 0;
}

function printUnsupported(platformKey) {
  const detected = `${process.platform}-${process.arch}`;
  console.error(`kanbots: no prebuilt binary for ${detected}.`);
  console.error('Supported: darwin-arm64, darwin-x64, linux-x64, win32-x64.');
  console.error(`Other platforms: build from source — ${RELEASES_URL.replace('/releases', '')}.`);
  void platformKey;
}

function printMissingBinary(platformKey) {
  console.error(`kanbots: launcher could not find the ${platformKey} binary under vendor/.`);
  console.error('Either the install download failed or your network blocked it.');
  console.error(`Grab the installer for your OS from: ${RELEASES_URL}`);
}

function main() {
  const platformKey = getPlatformKey();
  if (!platformKey) {
    printUnsupported(platformKey);
    process.exit(1);
  }

  let binary = resolveBinary(platformKey);
  if (!binary) {
    // First-run path or postinstall got skipped (npx cache, --ignore-scripts, etc.)
    const ok = runPostinstall();
    if (!ok) {
      printMissingBinary(platformKey);
      process.exit(1);
    }
    binary = resolveBinary(platformKey);
  }

  if (!binary) {
    printMissingBinary(platformKey);
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const child = spawn(binary, args, {
    stdio: 'inherit',
    // Detach on Windows so the GUI app survives the npx parent exit.
    detached: process.platform === 'win32',
    windowsHide: false,
  });

  // Forward terminating signals so Ctrl+C cleanly shuts the app down.
  const forward = (signal) => {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        // child may have already exited
      }
    }
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));
  process.on('SIGHUP', () => forward('SIGHUP'));

  child.on('error', (err) => {
    console.error(`kanbots: failed to launch ${binary}: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      // Node convention: replicate signal in exit code.
      process.exit(128 + (os.constants.signals[signal] ?? 0));
    }
    process.exit(code ?? 0);
  });
}

main();
