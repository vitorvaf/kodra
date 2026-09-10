import Database from 'better-sqlite3';

export type Db = Database.Database;

interface WriteRevision {
  value: number;
}

const writeRevisions = new WeakMap<object, WriteRevision>();

export function openDb(filename: string): Db {
  const rawDb = new Database(filename);
  applyPragmas(rawDb, filename);
  return trackDb(rawDb);
}

export function getOwnWriteRevision(db: Db): number {
  return writeRevisions.get(db)?.value ?? 0;
}

function trackDb(db: Db): Db {
  const revision: WriteRevision = { value: 0 };
  const bump = (): void => {
    revision.value += 1;
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
