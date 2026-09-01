import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0003_local_issues',
  up: `
    CREATE TABLE local_issues (
      number INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'open',
      labels TEXT NOT NULL DEFAULT '[]',
      assignees TEXT NOT NULL DEFAULT '[]',
      author_login TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE INDEX idx_local_issues_state ON local_issues(state);

    CREATE TABLE local_comments (
      id INTEGER PRIMARY KEY,
      issue_number INTEGER NOT NULL REFERENCES local_issues(number) ON DELETE CASCADE,
      body TEXT NOT NULL,
      author_login TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX idx_local_comments_issue ON local_comments(issue_number);
  `,
};
