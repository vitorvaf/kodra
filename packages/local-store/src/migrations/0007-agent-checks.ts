import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0007_agent_checks',
  up: `
    CREATE TABLE agent_checks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_run_id  INTEGER NOT NULL,
      kind          TEXT NOT NULL,
      status        TEXT NOT NULL,
      started_at    TEXT NOT NULL,
      finished_at   TEXT,
      summary       TEXT,
      FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_checks_run_kind ON agent_checks(agent_run_id, kind);
  `,
};
