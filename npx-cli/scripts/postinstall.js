#!/usr/bin/env node
// kanbots npx postinstall
//
// Downloads the platform binary matching this package's version from GitHub
// releases and unpacks it into vendor/<platform>/. The launcher at
// bin/kanbots.js spawns whatever lands here.
//
// Zero runtime dependencies on purpose — we only use Node built-ins plus
// system unzip/chmod where required.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const pkg = require(path.join(ROOT, 'package.json'));
const VERSION = String(pkg.version);
const TAG = `v${VERSION}`;
const RELEASES_URL = 'https://github.com/leodavinci1/kanbots/releases';
const RELEASE_BASE = `${RELEASES_URL}/download/${TAG}`;

function log(msg) {
  process.stderr.write(`kanbots: ${msg}\n`);
}

function getPlatformKey() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'win32' && arch === 'x64') return 'win32-x64';
  return null;
}

// Asset names follow docs/releasing.md exactly:
//   kanbots-<version>-mac-arm64.zip
//   kanbots-<version>-mac-x64.zip
//   kanbots-<version>-linux-x64.AppImage
//   kanbots-<version>-win-x64.exe
function getAssetName(platformKey) {
  switch (platformKey) {
    case 'darwin-arm64':
      return `kanbots-${VERSION}-mac-arm64.zip`;
    case 'darwin-x64':
      return `kanbots-${VERSION}-mac-x64.zip`;
    case 'linux-x64':
      return `kanbots-${VERSION}-linux-x64.AppImage`;
    case 'win32-x64':
      return `kanbots-${VERSION}-win-x64.exe`;
    default:
      return null;
  }
}

function targetBinaryPath(platformKey) {
  const dir = path.join(VENDOR, platformKey);
  if (platformKey.startsWith('darwin')) {
    return path.join(dir, 'kanbots.app', 'Contents', 'MacOS', 'kanbots');
  }
  if (platformKey === 'linux-x64') {
    return path.join(dir, 'kanbots.AppImage');
  }
  if (platformKey === 'win32-x64') {
    return path.join(dir, 'kanbots.exe');
  }
  return null;
}

function downloadToFile(url, destPath, redirectsLeft) {
  if (redirectsLeft == null) redirectsLeft = 6;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': `kanbots-npx/${VERSION}`,
          Accept: 'application/octet-stream',
        },
      },
      (res) => {
        const { statusCode, headers } = res;
        if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            return reject(new Error(`too many redirects fetching ${url}`));
          }
          const next = new URL(headers.location, url).toString();
          return downloadToFile(next, destPath, redirectsLeft - 1)
            .then(resolve)
            .catch(reject);
        }
        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${statusCode} fetching ${url}`));
        }

        const total = Number(headers['content-length']) || 0;
        let received = 0;
        let lastTick = 0;

        const tmpPath = `${destPath}.part`;
        const out = fs.createWriteStream(tmpPath);
        out.on('error', (err) => {
          try {
            fs.unlinkSync(tmpPath);
          } catch {}
          reject(err);
        });
        out.on('finish', () => {
          out.close((err) => {
            if (err) return reject(err);
            try {
              fs.renameSync(tmpPath, destPath);
              resolve();
            } catch (renameErr) {
              reject(renameErr);
            }
          });
        });

        res.on('data', (chunk) => {
          received += chunk.length;
          if (process.stderr.isTTY && (Date.now() - lastTick > 200 || received === total)) {
            lastTick = Date.now();
            const mb = (received / (1024 * 1024)).toFixed(1);
            const totalMb = total ? (total / (1024 * 1024)).toFixed(1) : '?';
            const pct = total ? Math.round((received / total) * 100) : null;
            process.stderr.write(
              `\rkanbots: downloading ${mb}MB / ${totalMb}MB${pct !== null ? ` (${pct}%)` : ''}      `,
            );
          }
        });
        res.on('end', () => {
          if (process.stderr.isTTY) process.stderr.write('\n');
        });
        res.pipe(out);
      },
    );
    req.on('error', reject);
    req.setTimeout(60_000, () => {
      req.destroy(new Error('download timed out after 60s'));
    });
  });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rmrf(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {}
}

function unzip(zipPath, destDir) {
  // macOS ships /usr/bin/unzip; Linux usually has it; we only call this on darwin.
  const result = spawnSync('unzip', ['-q', '-o', zipPath, '-d', destDir], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    throw new Error(
      `unzip failed (exit ${result.status}). Install the system 'unzip' tool, or download manually from ${RELEASES_URL}.`,
    );
  }
}

function clearQuarantine(appPath) {
  // The signed-and-notarized day is in the future; for now we ship unsigned and
  // strip the quarantine attribute the same way docs/getting-started.md does.
  spawnSync('xattr', ['-rd', 'com.apple.quarantine', appPath], {
    stdio: 'ignore',
  });
}

async function installDarwin(platformKey, assetName) {
  const platformDir = path.join(VENDOR, platformKey);
  ensureDir(platformDir);

  // Use a temp file outside vendor to avoid leaving partials behind on failure.
  const tmpZip = path.join(os.tmpdir(), `kanbots-${VERSION}-${platformKey}-${process.pid}.zip`);
  const url = `${RELEASE_BASE}/${assetName}`;

  log(`fetching ${assetName}`);
  await downloadToFile(url, tmpZip);

  // Wipe any old extraction so we don't merge versions.
  rmrf(path.join(platformDir, 'kanbots.app'));

  try {
    unzip(tmpZip, platformDir);
  } finally {
    try {
      fs.unlinkSync(tmpZip);
    } catch {}
  }

  const appPath = path.join(platformDir, 'kanbots.app');
  if (!fs.existsSync(appPath)) {
    // electron-builder may name the bundle differently if the build config changes —
    // fall back to whatever .app landed first.
    const entries = fs.readdirSync(platformDir).filter((n) => n.endsWith('.app'));
    if (entries.length === 1) {
      fs.renameSync(path.join(platformDir, entries[0]), appPath);
    } else {
      throw new Error(`no kanbots.app found in extracted archive at ${platformDir}`);
    }
  }
  clearQuarantine(appPath);

  const macBin = path.join(appPath, 'Contents', 'MacOS', 'kanbots');
  if (!fs.existsSync(macBin)) {
    // Try to recover by globbing — bundle could rename the inner exec.
    const macDir = path.join(appPath, 'Contents', 'MacOS');
    const candidates = fs.existsSync(macDir) ? fs.readdirSync(macDir) : [];
    if (candidates.length === 1) {
      fs.renameSync(path.join(macDir, candidates[0]), macBin);
    } else {
      throw new Error(`expected ${macBin}; got [${candidates.join(', ')}]`);
    }
  }
  fs.chmodSync(macBin, 0o755);
}

async function installLinux(platformKey, assetName) {
  const platformDir = path.join(VENDOR, platformKey);
  ensureDir(platformDir);

  const destPath = path.join(platformDir, 'kanbots.AppImage');
  const url = `${RELEASE_BASE}/${assetName}`;

  log(`fetching ${assetName}`);
  await downloadToFile(url, destPath);
  fs.chmodSync(destPath, 0o755);
}

function installWindowsStub(platformKey, assetName) {
  // v1 Windows flow: download the NSIS installer and ask the user to run it.
  // Silent install via NSIS /S works but the resulting app launches outside the
  // vendor tree, which complicates the launcher. Defer the auto-install plumbing
  // to a later version once the installer flags are nailed down.
  const platformDir = path.join(VENDOR, platformKey);
  ensureDir(platformDir);
  const installerPath = path.join(platformDir, assetName);
  log(`Windows: auto-launch is not wired up yet for the npx flow.`);
  log(`Download and run the installer from: ${RELEASE_BASE}/${assetName}`);
  log(`Saving installer reference at ${installerPath} (no download performed).`);
  // No stub binary placed: kanbots.exe is intentionally absent so the launcher
  // prints the same release-page message.
}

function alreadyInstalled(platformKey) {
  const target = targetBinaryPath(platformKey);
  return target != null && fs.existsSync(target);
}

async function main() {
  if (process.env.KANBOTS_SKIP_POSTINSTALL === '1') {
    log('KANBOTS_SKIP_POSTINSTALL=1 — skipping binary download.');
    return;
  }

  const platformKey = getPlatformKey();
  if (!platformKey) {
    log(`no prebuilt binary for ${process.platform}-${process.arch}.`);
    log('Supported: darwin-arm64, darwin-x64, linux-x64, win32-x64.');
    log(`Download or build manually: ${RELEASES_URL}`);
    return; // Don't fail the install — let users see the launcher message.
  }

  if (alreadyInstalled(platformKey)) {
    log(`platform binary already present at vendor/${platformKey}.`);
    return;
  }

  const assetName = getAssetName(platformKey);
  if (!assetName) {
    log(`no asset mapping for ${platformKey}.`);
    return;
  }

  ensureDir(VENDOR);

  try {
    if (platformKey.startsWith('darwin')) {
      await installDarwin(platformKey, assetName);
    } else if (platformKey === 'linux-x64') {
      await installLinux(platformKey, assetName);
    } else if (platformKey === 'win32-x64') {
      installWindowsStub(platformKey, assetName);
      return;
    }
    log(`installed binary for ${platformKey}. Run \`npx kanbots\` to launch.`);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    log(`install failed: ${msg}`);
    log(`If your network is offline or restricted, grab the build manually:`);
    log(`  ${RELEASES_URL}`);
    // Don't fail the whole `npm install` — bin/kanbots.js will give a friendly
    // error if vendor is still empty when the user runs the launcher.
  }
}

// TODO: verify a SHA256 from a release-published manifest once the release
// pipeline emits one. Today the workflow uploads binaries directly; once we
// add a sidecar manifest.json with hashes the verify step plugs in here.

main().catch((err) => {
  log(`unexpected error: ${err && err.stack ? err.stack : err}`);
});
