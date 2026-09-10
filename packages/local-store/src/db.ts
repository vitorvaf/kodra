import Database from 'better-sqlite3';

export type Db = Database.Database;

export interface OwnWriteRevisions {
  events: number;
  data: number;
}

interface WriteTrackingState extends OwnWriteRevisions {
  eventWriteDepth: number;
}

const writeRevisions = new WeakMap<object, WriteTrackingState>();

export function openDb(filename: string): Db {
  const rawDb = new Database(filename);
  applyPragmas(rawDb, filename);
  return trackDb(rawDb);
}

export function getOwnWriteRevisions(db: Db): OwnWriteRevisions {
  const state = writeRevisions.get(db);
  return { events: state?.events ?? 0, data: state?.data ?? 0 };
}

export function withEventWriteScope<T>(db: Db, fn: () => T): T {
  const state = writeRevisions.get(db);
  if (!state) return fn();
  state.eventWriteDepth += 1;
  try {
    return fn();
  } finally {
    state.eventWriteDepth -= 1;
  }
}

function trackDb(db: Db): Db {
  const revision: WriteTrackingState = { events: 0, data: 0, eventWriteDepth: 0 };
  const bump = (): void => {
    if (revision.eventWriteDepth > 0) revision.events += 1;
    else revision.data += 1;
  };

  const tracked = new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') {
        return (source: string) => trackStatement(target.prepare(source), bump);
      }
      if (property === 'exec') {
        return (source: string) => {
          const result = target.exec(source);
          bump();
          return result;
        };
      }
      if (property === 'transaction') {
        return (...args: unknown[]) => {
          const transaction = Reflect.apply(
            target.transaction as (...args: unknown[]) => unknown,
            target,
            args,
          ) as (...args: unknown[]) => unknown;
          return new Proxy(transaction, {
            apply(tx, thisArg, txArgs) {
              const result = Reflect.apply(tx, thisArg, txArgs);
              bump();
              return result;
            },
          });
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Db;
  writeRevisions.set(tracked, revision);
  return tracked;
}

function trackStatement(
  statement: ReturnType<Db['prepare']>,
  bump: () => void,
): ReturnType<Db['prepare']> {
  return new Proxy(statement, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (property === 'run' && typeof value === 'function') {
        return (...args: unknown[]) => {
          const result = Reflect.apply(value, target, args);
          bump();
          return result;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as ReturnType<Db['prepare']>;
}

function applyPragmas(db: Db, filename: string): void {
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (filename !== ':memory:') {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
}
