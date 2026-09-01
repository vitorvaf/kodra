const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };

const PLATFORM_NAMES = { darwin: 'darwin', linux: 'linux', win32: 'win32', mas: 'darwin' };

module.exports = async function beforePack(context) {
  const archName = ARCH_NAMES[context.arch];
  const platformName = PLATFORM_NAMES[context.electronPlatformName];

  if (!archName || !platformName) {
    throw new Error(
      `[before-pack] unsupported target: platform=${context.electronPlatformName} arch=${context.arch}`,
    );
  }

  if (archName === 'universal') {
    throw new Error('[before-pack] universal arch is not supported by the better-sqlite3 prebuild flow');
  }

  const script = resolve(__dirname, 'ensure-native.cjs');
  const result = spawnSync(
    process.execPath,
    [script, `--platform=${platformName}`, `--arch=${archName}`],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) {
    throw new Error(`[before-pack] ensure-native failed for ${platformName}/${archName}`);
  }
};
