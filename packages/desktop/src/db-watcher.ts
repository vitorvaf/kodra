import { stat } from 'node:fs/promises';

export interface DbWatcher {
  stop(): void;
}

export interface WatchDbFileOptions {
  /** Poll interval in ms. */
  intervalMs?: number;
}

interface FileSig {
  size: number;
  mtimeMs: number;
}

/**
 * Watches a SQLite database file for external writes by polling the WAL's
 * size and mtime. Used so sqlite3 CLI edits or a second process propagate
 * to the renderer without restart.
 *
 * Why polling instead of fs.watch? In WAL mode SQLite updates `-shm` on
 * reads (read-mark slots), so a directory watcher fires for every read.
 * That feedback-loops with the renderer, which reads the db on every
 * `issues:changed` broadcast. The WAL file's *size and mtime* only change
 * on commits or checkpoints — never on reads — so polling them is the
 * cleanest signal.
 */
export function watchDbFile(
  dbPath: string,
  onChange: () => void,
  opts: WatchDbFileOptions = {},
): DbWatcher {
  const intervalMs = opts.intervalMs ?? 2000;
  const walPath = `${dbPath}-wal`;

  let lastDb: FileSig | null = null;
  let lastWal: FileSig | null = null;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let inFlight = false;

  async function snapshot(path: string): Promise<FileSig | null> {
    try {
      const s = await stat(path);
      return { size: s.size, mtimeMs: s.mtimeMs };
    } catch {
      return null;
    }
  }

  function changed(prev: FileSig | null, next: FileSig | null): boolean {
    if (prev === null && next === null) return false;
    if (prev === null || next === null) return true;
    return prev.size !== next.size || prev.mtimeMs !== next.mtimeMs;
  }

  async function tick(): Promise<void> {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const [db, wal] = await Promise.all([snapshot(dbPath), snapshot(walPath)]);
      const dbChanged = changed(lastDb, db);
      const walChanged = changed(lastWal, wal);
      const isFirstSnapshot = lastDb === null && lastWal === null;
      lastDb = db;
      lastWal = wal;
      if (isFirstSnapshot) return;
      if (!dbChanged && !walChanged) return;
      try {
        onChange();
      } catch {
        // never let a refetch broadcast failure kill the watcher
      }
    } finally {
      inFlight = false;
    }
  }

  // Prime the snapshot so the first tick doesn't fire spuriously.
  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
