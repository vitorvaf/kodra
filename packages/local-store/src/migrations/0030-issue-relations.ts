import type { Migration } from './types.js';

// Parent ↔ child issue relations. Kept as a thin sidecar table so the
// existing `local_issues` schema (and the GitHub-backed Issue surface)
// stays untouched. Issue numbers are unique within a workspace whether
// the workspace stores issues locally or pulls them from GitHub, so a
// single (workspace, parent_number, child_number) tuple is sufficient
// — the resolver layer knows how to fetch either kind by number.
//
// Indexed on both ends because the renderer needs cheap lookups in two
// directions: "what children does #42 have?" and "what parents does
// #100 have?" (the second drives the breadcrumb "Parent: #42" on
// sub-issue detail views).
//
// `CHECK (parent_number != child_number)` blocks the trivial self-loop
// at the SQL layer; deeper cycles (A → B → A) are blocked in the
// handler by walking the ancestor chain before insert, since SQLite
// doesn't have a native recursive CHECK constraint.
export const migration: Migration = {
  id: '0030_issue_relations',
  up: `
    CREATE TABLE issue_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      parent_number INTEGER NOT NULL,
      child_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      UNIQUE(workspace_id, parent_number, child_number),
      CHECK (parent_number != child_number)
    );

    CREATE INDEX idx_issue_relations_parent
      ON issue_relations(workspace_id, parent_number);
    CREATE INDEX idx_issue_relations_child
      ON issue_relations(workspace_id, child_number);
  `,
};
