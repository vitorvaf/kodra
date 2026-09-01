import Database from 'better-sqlite3';

export type Db = Database.Database;

export function openDb(filename: string): Db {
  const db = new Database(filename);
  applyPragmas(db, filename);
  return db;
}

function applyPragmas(db: Db, filename: string): void {
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (filename !== ':memory:') {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
}
