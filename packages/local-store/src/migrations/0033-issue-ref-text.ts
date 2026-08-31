import type { Migration } from './types.js';

// Irreversible by design once custom ids exist; migrations are up-only.
export const migration: Migration = {
  id: '0033_issue_ref_text',
  disableForeignKeys: true,
  up: `
    CREATE TABLE local_issues_new (
      number TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'open',
      labels TEXT NOT NULL DEFAULT '[]',
      assignees TEXT NOT NULL DEFAULT '[]',
      author_login TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT,
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL
    );

    INSERT INTO local_issues_new
      (number, title, body, state, labels, assignees, author_login,
       created_at, updated_at, closed_at, folder_id)
    SELECT CAST(number AS TEXT), title, body, state, labels, assignees, author_login,
           created_at, updated_at, closed_at, folder_id
      FROM local_issues;

    DROP INDEX IF EXISTS idx_local_issues_state;
    DROP INDEX IF EXISTS idx_local_issues_folder;
    DROP TABLE local_issues;
    ALTER TABLE local_issues_new RENAME TO local_issues;

    CREATE INDEX idx_local_issues_state ON local_issues(state);
    CREATE INDEX idx_local_issues_folder ON local_issues(folder_id);

    CREATE TABLE local_comments_new (
      id INTEGER PRIMARY KEY,
      issue_number TEXT NOT NULL REFERENCES local_issues(number) ON DELETE CASCADE,
      body TEXT NOT NULL,
      author_login TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO local_comments_new
      (id, issue_number, body, author_login, created_at, updated_at)
    SELECT id, CAST(issue_number AS TEXT), body, author_login, created_at, updated_at
      FROM local_comments;

    DROP INDEX IF EXISTS idx_local_comments_issue;
    DROP TABLE local_comments;
    ALTER TABLE local_comments_new RENAME TO local_comments;

    CREATE INDEX idx_local_comments_issue ON local_comments(issue_number);
  `,
};
