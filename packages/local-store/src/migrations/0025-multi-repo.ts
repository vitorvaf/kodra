import type { Migration } from './types.js';

// Multi-repo workspaces: a workspace can mount N repos, each with its own
// target branch and git state. The existing `folders` table tracks per-repo
// paths inside a workspace but lacks the per-repo target_branch + primary
// flag needed for agent runs to pick which checkout to use. We add a
// dedicated `workspace_repos` table that owns those fields, and backfill
// from `folders` so existing single-repo workspaces continue working — the
// chronologically-first folder per workspace is marked is_primary=1.
//
// The `folders` table is kept around (no destructive changes) so the legacy
// folder picker keeps rendering during the transition; new code should
// prefer `workspace_repos`.
export const migration: Migration = {
  id: '0025_multi_repo',
  up: `
    CREATE TABLE workspace_repos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id  TEXT NOT NULL,
      repo_path     TEXT NOT NULL,
      display_name  TEXT,
      target_branch TEXT,
      is_primary    INTEGER NOT NULL DEFAULT 0,
      added_at      TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      UNIQUE(workspace_id, repo_path)
    );

    CREATE INDEX idx_workspace_repos_workspace ON workspace_repos(workspace_id);
    CREATE INDEX idx_workspace_repos_primary ON workspace_repos(workspace_id, is_primary);

    -- Backfill from \`folders\` (which today holds one row per (workspace,
    -- repo)). Each workspace's earliest folder by added_at is treated as
    -- the primary repo; remaining folders are added as non-primary repos.
    -- display_name reuses the folder's name; target_branch starts NULL
    -- (renderer can populate later via the set-target-branch handler).
    INSERT INTO workspace_repos (workspace_id, repo_path, display_name, target_branch, is_primary, added_at)
      SELECT
        f.workspace_id,
        f.path,
        f.name,
        NULL,
        CASE
          WHEN f.added_at = (
            SELECT MIN(added_at) FROM folders f2 WHERE f2.workspace_id = f.workspace_id
          ) THEN 1
          ELSE 0
        END,
        f.added_at
      FROM folders f
      WHERE NOT EXISTS (
        SELECT 1 FROM workspace_repos wr
        WHERE wr.workspace_id = f.workspace_id AND wr.repo_path = f.path
      );
  `,
};
