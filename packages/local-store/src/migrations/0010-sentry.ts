import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0010_sentry',
  up: `
    CREATE TABLE sentry_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      org_slug TEXT,
      project_slug TEXT,
      token_encrypted BLOB,
      token_encryption TEXT NOT NULL DEFAULT 'plain',
      poll_interval_seconds INTEGER NOT NULL DEFAULT 300,
      environment_filter TEXT DEFAULT 'production',
      last_synced_at TEXT,
      last_error TEXT,
      consecutive_auth_failures INTEGER NOT NULL DEFAULT 0
    );

    INSERT INTO sentry_config (id) VALUES (1);

    CREATE TABLE sentry_imports (
      sentry_issue_id TEXT PRIMARY KEY,
      local_issue_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'imported',
      count INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_event_id TEXT,
      permalink TEXT,
      culprit TEXT,
      error_type TEXT,
      error_value TEXT,
      analyzed_at TEXT,
      suggestion_json TEXT,
      FOREIGN KEY (local_issue_number) REFERENCES local_issues(number) ON DELETE CASCADE
    );

    CREATE INDEX idx_sentry_imports_local_issue ON sentry_imports(local_issue_number);
    CREATE INDEX idx_sentry_imports_status ON sentry_imports(status);
  `,
};
