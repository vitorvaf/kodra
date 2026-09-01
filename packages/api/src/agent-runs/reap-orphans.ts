import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const SIGTERM_GRACE_MS = 1500;

export type ReapOutcome =
  | { kind: 'reaped'; pid: number; signal: 'SIGTERM' | 'SIGKILL' }
  | { kind: 'gone'; pid: number }
  | { kind: 'skipped'; pid: number; reason: string }
  | { kind: 'error'; pid: number; message: string };

export interface ReapOptions {
  /** Substring(s) the process command name must contain. Case-insensitive. */
  expectedCommandSubstrings: ReadonlyArray<string>;
  /** Override for tests. */
  kill?: (pid: number, signal: number | NodeJS.Signals) => void;
  /** Override for tests. */
  readComm?: (pid: number) => string | null;
  /** Override for tests. Defaults to ~1.5s. */
  graceMs?: number;
  /** Override for tests. */
  sleep?: (ms: number) => Promise<void>;
}

function defaultKill(pid: number, signal: number | NodeJS.Signals): void {
  process.kill(pid, signal);
}

function defaultReadComm(pid: number): string | null {
  if (process.platform === 'linux') {
    try {
      return readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
    } catch {
      return null;
    }
  }
  if (process.platform === 'darwin') {
    try {
      const out = execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const trimmed = out.toString('utf8').trim();
      if (!trimmed) return null;
      // ps may print full path; reduce to basename for matching purposes.
      const basename = trimmed.split('/').pop() ?? trimmed;
      return basename;
    } catch {
      return null;
    }
  }
  // On Windows we cannot cheaply confirm command name without extra deps; skip.
  return null;
}

function isAlive(pid: number, kill: (pid: number, signal: number | NodeJS.Signals) => void): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH: no such process. EPERM: process exists but we can't signal — treat
    // as alive; we'll fail later when we try to kill, and that's fine.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM') return true;
    return false;
  }
}

/**
 * Best-effort reap of a PID we believe belongs to a previous app generation.
 *
 * Liveness is checked first; if the process is gone we report 'gone' so the
 * caller can mark the row with an audit-friendly reason. If alive, we verify
 * the process command name contains one of `expectedCommandSubstrings` to
 * guard against PID reuse — without this check, a recycled PID owned by an
 * unrelated process would be killed.
 */
export async function reapOrphanProcess(
  pid: number,
  opts: ReapOptions,
): Promise<ReapOutcome> {
  const kill = opts.kill ?? defaultKill;
  const readComm = opts.readComm ?? defaultReadComm;
  const sleep = opts.sleep ?? delay;
  const graceMs = opts.graceMs ?? SIGTERM_GRACE_MS;

  if (!Number.isInteger(pid) || pid <= 0) {
    return { kind: 'skipped', pid, reason: 'invalid pid' };
  }

  if (!isAlive(pid, kill)) {
    return { kind: 'gone', pid };
  }

  const comm = readComm(pid);
  if (comm !== null) {
    const lower = comm.toLowerCase();
    const matches = opts.expectedCommandSubstrings.some((needle) =>
      lower.includes(needle.toLowerCase()),
    );
    if (!matches) {
      return {
        kind: 'skipped',
        pid,
        reason: `command name '${comm}' does not match expected (${opts.expectedCommandSubstrings.join('|')})`,
      };
    }
  }
  // comm === null on Windows or unreadable: proceed without the guard. The
  // POSIX path is the load-bearing case; Windows users are no worse off than
  // the prior behaviour (which never reaped at all).

  try {
    kill(pid, 'SIGTERM');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return { kind: 'gone', pid };
    return { kind: 'error', pid, message: (err as Error).message };
  }

  await sleep(graceMs);

  if (!isAlive(pid, kill)) {
    return { kind: 'reaped', pid, signal: 'SIGTERM' };
  }

  try {
    kill(pid, 'SIGKILL');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return { kind: 'reaped', pid, signal: 'SIGTERM' };
    return { kind: 'error', pid, message: (err as Error).message };
  }

  return { kind: 'reaped', pid, signal: 'SIGKILL' };
}

export function describeReapOutcome(outcome: ReapOutcome): string {
  switch (outcome.kind) {
    case 'reaped':
      return `interrupted: reaped orphan pid ${outcome.pid} (${outcome.signal})`;
    case 'gone':
      return `interrupted: pid ${outcome.pid} not running`;
    case 'skipped':
      return `interrupted: pid ${outcome.pid} skipped (${outcome.reason})`;
    case 'error':
      return `interrupted: pid ${outcome.pid} reap error (${outcome.message})`;
  }
}
