import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0022_diff_hunks',
  up: `
    CREATE TABLE diff_hunks (
      id INTEGER PRIMARY KEY,
      agent_run_id INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      tool_use_event_id INTEGER REFERENCES agent_events(id) ON DELETE SET NULL,
      snapshot_id TEXT NOT NULL UNIQUE,
      file_path TEXT NOT NULL,
      op_index INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL CHECK (mode IN ('edit', 'write', 'multiedit_op')),
      before_text TEXT,
      after_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
      reject_reason TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX idx_diff_hunks_run ON diff_hunks(agent_run_id);
    CREATE INDEX idx_diff_hunks_run_file ON diff_hunks(agent_run_id, file_path);
    CREATE INDEX idx_diff_hunks_status ON diff_hunks(agent_run_id, status);
  `,
};
