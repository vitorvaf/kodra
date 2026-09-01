import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';

const DEFAULT_RANGE = 10;

export interface InstanceLockOptions {
  basePort: number;
  lockDir: string;
  range?: number;
  hooks?: InstanceLockHooks;
}

export interface InstanceLockHooks {
  isPidAlive?: (pid: number) => boolean;
  tryBindPort?: (port: number) => Promise<BoundPort | null>;
  now?: () => number;
  pid?: () => number;
}

export interface BoundPort {
  close: () => Promise<void>;
}

export interface InstanceLockHandle {
  port: number;
  release: () => Promise<void>;
}

interface LockFileBody {
  pid: number;
  startedAt: number;
  port: number;
}

export class AllPortsBusyError extends Error {
  override readonly name = 'AllPortsBusyError';

  constructor(
    readonly basePort: number,
    readonly range: number,
  ) {
    super(`all bridge ports busy in range [${basePort}..${basePort + range - 1}]`);
  }
}

function lockfilePath(lockDir: string, port: number): string {
  return path.join(lockDir, `bridge-${port}.lock`);
}

function readLockFile(filePath: string): LockFileBody | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const body = parsed as Record<string, unknown>;
  if (
    typeof body['pid'] !== 'number' ||
    typeof body['startedAt'] !== 'number' ||
    typeof body['port'] !== 'number'
  ) {
    return null;
  }
  return { pid: body['pid'], startedAt: body['startedAt'], port: body['port'] };
}

function defaultIsPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

function defaultTryBindPort(port: number): Promise<BoundPort | null> {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const settle = (value: BoundPort | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    server.once('error', () => settle(null));
    server.listen(port, '127.0.0.1', () => {
      settle({
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

export async function acquireInstanceLock(
  opts: InstanceLockOptions,
): Promise<InstanceLockHandle> {
  const range = opts.range ?? DEFAULT_RANGE;
  const isPidAlive = opts.hooks?.isPidAlive ?? defaultIsPidAlive;
  const tryBindPort = opts.hooks?.tryBindPort ?? defaultTryBindPort;
  const now = opts.hooks?.now ?? Date.now;
  const pid = opts.hooks?.pid ?? (() => process.pid);

  fs.mkdirSync(opts.lockDir, { recursive: true });

  for (let i = 0; i < range; i++) {
    const port = opts.basePort + i;
    const lockPath = lockfilePath(opts.lockDir, port);
    const existing = readLockFile(lockPath);

    if (existing && isPidAlive(existing.pid)) {
      continue;
    }
    if (existing) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // race with another reclaim — proceed; bind/lockfile-write will
        // arbitrate.
      }
    }

    const bound = await tryBindPort(port);
    if (!bound) continue;

    const body: LockFileBody = { pid: pid(), startedAt: now(), port };
    try {
      fs.writeFileSync(lockPath, JSON.stringify(body), { encoding: 'utf8', flag: 'wx' });
    } catch {
      await bound.close();
      continue;
    }

    let released = false;

    const cleanupSync = () => {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // already gone
      }
    };

    const onSignal = () => {
      released = true;
      cleanupSync();
    };

    process.on('exit', onSignal);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    const release = async (): Promise<void> => {
      if (released) {
        process.removeListener('exit', onSignal);
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
        return;
      }
      released = true;
      process.removeListener('exit', onSignal);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      await bound.close();
      cleanupSync();
    };

    return { port, release };
  }

  throw new AllPortsBusyError(opts.basePort, range);
}
