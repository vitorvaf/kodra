import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0019_project_scope',
  up: `
    ALTER TABLE threads ADD COLUMN project_id TEXT;
    ALTER TABLE messages ADD COLUMN project_id TEXT;
    ALTER TABLE cards ADD COLUMN project_id TEXT;
    ALTER TABLE agent_runs ADD COLUMN project_id TEXT;
    ALTER TABLE agent_events ADD COLUMN project_id TEXT;
    ALTER TABLE agent_checks ADD COLUMN project_id TEXT;
    ALTER TABLE autopilot_sessions ADD COLUMN project_id TEXT;
    ALTER TABLE local_issues ADD COLUMN project_id TEXT;
    ALTER TABLE local_comments ADD COLUMN project_id TEXT;
    ALTER TABLE chat_conversations ADD COLUMN project_id TEXT;
    ALTER TABLE promotions ADD COLUMN project_id TEXT;

    CREATE INDEX idx_threads_project ON threads(project_id);
    CREATE INDEX idx_messages_project ON messages(project_id);
    CREATE INDEX idx_cards_project ON cards(project_id);
    CREATE INDEX idx_agent_runs_project ON agent_runs(project_id);
    CREATE INDEX idx_agent_events_project ON agent_events(project_id);
    CREATE INDEX idx_agent_checks_project ON agent_checks(project_id);
    CREATE INDEX idx_autopilot_sessions_project ON autopilot_sessions(project_id);
    CREATE INDEX idx_local_issues_project ON local_issues(project_id);
    CREATE INDEX idx_local_comments_project ON local_comments(project_id);
    CREATE INDEX idx_chat_conversations_project ON chat_conversations(project_id);
    CREATE INDEX idx_promotions_project ON promotions(project_id);

    CREATE TABLE sync_state (
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      remote_id TEXT,
      remote_version INTEGER,
      local_dirty INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      PRIMARY KEY (table_name, row_id)
    );

    CREATE INDEX idx_sync_state_project ON sync_state(project_id);
    CREATE INDEX idx_sync_state_dirty ON sync_state(local_dirty);

    CREATE TABLE cloud_account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      account_id TEXT NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      endpoint TEXT NOT NULL,
      auth_token_encrypted BLOB,
      auth_token_encryption TEXT NOT NULL DEFAULT 'plain',
      signed_in_at TEXT NOT NULL,
      last_refreshed_at TEXT
    );
  `,
};
