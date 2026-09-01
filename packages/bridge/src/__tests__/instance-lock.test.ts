import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AllPortsBusyError,
  acquireInstanceLock,
  type BoundPort,
  type InstanceLockHooks,
} from '../instance-lock.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbots-bridge-lock-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function fakeBoundPort(): { port: BoundPort; closed: () => boolean } {
  let isClosed = false;
  const port: BoundPort = {
    close: async () => {
      isClosed = true;
    },
  };
  return { port, closed: () => isClosed };
}

function lockfileFor(dir: string, port: number): string {
  return path.join(dir, `bridge-${port}.lock`);
}

describe('acquireInstanceLock', () => {
  it('binds the first free port and writes a lockfile', async () => {
    const bound = fakeBoundPort();
    const hooks: InstanceLockHooks = {
      isPidAlive: () => false,
      tryBindPort: async () => bound.port,
      now: () => 1700000000000,
      pid: () => 4242,
    };

    const handle = await acquireInstanceLock({
      basePort: 5000,
      lockDir: tmpDir,
      hooks,
    });

    expect(handle.port).toBe(5000);
    const body = JSON.parse(fs.readFileSync(lockfileFor(tmpDir, 5000), 'utf8')) as {
      pid: number;
      startedAt: number;
      port: number;
    };
    expect(body).toEqual({ pid: 4242, startedAt: 1700000000000, port: 5000 });

    await handle.release();
    expect(bound.closed()).toBe(true);
    expect(fs.existsSync(lockfileFor(tmpDir, 5000))).toBe(false);
  });

  it('reclaims a stale lock (pid not alive) and binds the same port', async () => {
    fs.writeFileSync(
      lockfileFor(tmpDir, 5000),
      JSON.stringify({ pid: 99999, startedAt: 1, port: 5000 }),
    );

    const bound = fakeBoundPort();
    const hooks: InstanceLockHooks = {
      isPidAlive: (pid) => pid === 12345,
      tryBindPort: async () => bound.port,
      now: () => 1700000000001,
      pid: () => 12345,
    };

    const handle = await acquireInstanceLock({
      basePort: 5000,
      lockDir: tmpDir,
      hooks,
    });

    expect(handle.port).toBe(5000);
    const body = JSON.parse(fs.readFileSync(lockfileFor(tmpDir, 5000), 'utf8')) as {
      pid: number;
    };
    expect(body.pid).toBe(12345);

    await handle.release();
  });

  it('skips a port whose lock owner is still alive and tries the next one', async () => {
    fs.writeFileSync(
      lockfileFor(tmpDir, 5000),
      JSON.stringify({ pid: 11111, startedAt: 1, port: 5000 }),
    );

    const bound = fakeBoundPort();
    const hooks: InstanceLockHooks = {
      isPidAlive: (pid) => pid === 11111,
      tryBindPort: async (port) => (port === 5001 ? bound.port : null),
      now: () => 2,
      pid: () => 22222,
    };

    const handle = await acquireInstanceLock({
      basePort: 5000,
      lockDir: tmpDir,
      hooks,
    });

    expect(handle.port).toBe(5001);
    expect(fs.existsSync(lockfileFor(tmpDir, 5000))).toBe(true);
    expect(fs.existsSync(lockfileFor(tmpDir, 5001))).toBe(true);

    await handle.release();
    expect(fs.existsSync(lockfileFor(tmpDir, 5001))).toBe(false);
  });

  it('throws AllPortsBusyError when every port in the range is alive', async () => {
    const range = 4;
    for (let i = 0; i < range; i++) {
      fs.writeFileSync(
        lockfileFor(tmpDir, 6000 + i),
        JSON.stringify({ pid: 1000 + i, startedAt: 1, port: 6000 + i }),
      );
    }
    const hooks: InstanceLockHooks = {
      isPidAlive: () => true,
      tryBindPort: async () => fakeBoundPort().port,
      now: () => 1,
      pid: () => 9999,
    };

    await expect(
      acquireInstanceLock({ basePort: 6000, lockDir: tmpDir, range, hooks }),
    ).rejects.toBeInstanceOf(AllPortsBusyError);
  });

  it('skips a port whose bind fails and tries the next one', async () => {
    const bound = fakeBoundPort();
    const hooks: InstanceLockHooks = {
      isPidAlive: () => false,
      tryBindPort: async (port) => (port === 7001 ? bound.port : null),
      now: () => 3,
      pid: () => 5555,
    };

    const handle = await acquireInstanceLock({
      basePort: 7000,
      lockDir: tmpDir,
      range: 3,
      hooks,
    });

    expect(handle.port).toBe(7001);
    await handle.release();
  });

  it('release is idempotent — second call is a no-op', async () => {
    const bound = fakeBoundPort();
    const hooks: InstanceLockHooks = {
      isPidAlive: () => false,
      tryBindPort: async () => bound.port,
      now: () => 4,
      pid: () => 7777,
    };

    const handle = await acquireInstanceLock({
      basePort: 8000,
      lockDir: tmpDir,
      hooks,
    });

    await handle.release();
    await handle.release();
    expect(bound.closed()).toBe(true);
  });
});
