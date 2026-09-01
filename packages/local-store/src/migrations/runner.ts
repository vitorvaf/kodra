import type { Db } from '../db.js';
import type { Migration } from './types.js';

const MIGRATION_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`;

export function runMigrations(db: Db, migrations: readonly Migration[]): void {
  db.exec(MIGRATION_TABLE_DDL);

  const appliedRows = db.prepare('SELECT id FROM _migrations').all() as { id: string }[];
  const applied = new Set(appliedRows.map((r) => r.id));

  const insertApplied = db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');

  for (const m of migrations) {
    if (applied.has(m.id)) continue;

    db.transaction(() => {
      db.exec(m.up);
      insertApplied.run(m.id, new Date().toISOString());
    })();
  }
}
