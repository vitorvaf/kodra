import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0021_learnings',
  up: `
    CREATE TABLE learnings (
      id INTEGER PRIMARY KEY,
      repo_owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      tag TEXT NOT NULL CHECK (tag IN ('convention','gotcha','fragile','decision-rationale')),
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      source_run_id INTEGER REFERENCES agent_runs(id),
      confidence REAL NOT NULL DEFAULT 0.5,
      evidence_event_seq_min INTEGER,
      evidence_event_seq_max INTEGER,
      embedding BLOB,
      pinned INTEGER NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      supersedes_id INTEGER REFERENCES learnings(id),
      deleted_at TEXT
    );

    CREATE UNIQUE INDEX idx_learnings_hash_active
      ON learnings(repo_owner, repo_name, content_hash) WHERE deleted_at IS NULL;
    CREATE INDEX idx_learnings_repo_active
      ON learnings(repo_owner, repo_name, deleted_at, pinned, last_used_at);
    CREATE INDEX idx_learnings_tag ON learnings(repo_owner, repo_name, tag) WHERE deleted_at IS NULL;
    CREATE INDEX idx_learnings_source ON learnings(source_run_id);

    CREATE TABLE curator_run_state (
      repo_owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      daily_budget_usd REAL,
      spent_today_usd REAL NOT NULL DEFAULT 0,
      spent_date TEXT,
      PRIMARY KEY (repo_owner, repo_name)
    );
  `,
};
