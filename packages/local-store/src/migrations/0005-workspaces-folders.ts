import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0005_workspaces_folders',
  up: `
    CREATE TABLE workspaces (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE folders (
      id              TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL,
      name            TEXT NOT NULL,
      path            TEXT NOT NULL,
      default_branch  TEXT NOT NULL DEFAULT 'main',
      added_at        TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_folders_workspace ON folders(workspace_id);
    CREATE UNIQUE INDEX idx_folders_path ON folders(path);
  `,
};
