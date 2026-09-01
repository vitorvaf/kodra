import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0001_initial',
  up: `
    CREATE TABLE threads (
      id INTEGER PRIMARY KEY,
      repo_owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      issue_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(repo_owner, repo_name, issue_number)
    );

    CREATE TABLE agent_runs (
      id INTEGER PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES threads(id),
      worktree_path TEXT,
      branch_name TEXT,
      pid INTEGER,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      token_usage_input INTEGER,
      token_usage_output INTEGER,
      exit_reason TEXT
    );

    CREATE TABLE messages (
      id INTEGER PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES threads(id),
      role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      agent_run_id INTEGER REFERENCES agent_runs(id),
      promoted_github_comment_id INTEGER,
      promoted_at TEXT
    );

    CREATE TABLE cards (
      id INTEGER PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id),
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      resolved_value TEXT,
      resolved_at TEXT
    );

    CREATE TABLE agent_events (
      id INTEGER PRIMARY KEY,
      agent_run_id INTEGER NOT NULL REFERENCES agent_runs(id),
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE promotions (
      id INTEGER PRIMARY KEY,
      card_id INTEGER REFERENCES cards(id),
      message_id INTEGER REFERENCES messages(id),
      kind TEXT NOT NULL,
      github_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE http_cache (
      key TEXT PRIMARY KEY,
      etag TEXT,
      last_modified TEXT,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX idx_messages_thread ON messages(thread_id);
    CREATE INDEX idx_cards_message ON cards(message_id);
    CREATE INDEX idx_events_run_seq ON agent_events(agent_run_id, seq);
  `,
};
