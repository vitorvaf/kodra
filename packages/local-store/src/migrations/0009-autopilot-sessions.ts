import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0009_autopilot_sessions',
  up: `
    CREATE TABLE autopilot_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_number INTEGER NOT NULL,
      kind TEXT NOT NULL,
      config TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      stop_reason TEXT,
      cycle_index INTEGER NOT NULL DEFAULT 0,
      current_child_run_id INTEGER,
      children_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX idx_autopilot_sessions_status ON autopilot_sessions(status);
    CREATE INDEX idx_autopilot_sessions_issue ON autopilot_sessions(issue_number);
  `,
};
