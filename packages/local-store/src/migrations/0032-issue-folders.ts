import type { Migration } from './types.js';

/**
 * Associate local issues with the workspace folder that owns them. The column
 * is nullable so databases without a uniquely identifiable legacy folder keep
 * their old, unscoped behaviour.
 */
export const migration: Migration = {
  id: '0032_issue_folders',
  up: `
    ALTER TABLE local_issues
      ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;

    CREATE INDEX idx_local_issues_folder ON local_issues(folder_id);

    -- Existing local databases have one default workspace and, historically,
    -- one folder. Only backfill when that folder is unambiguous; otherwise
    -- retaining NULL preserves the pre-folder query semantics.
    UPDATE local_issues
       SET folder_id = (
         SELECT f.id
           FROM folders f
          WHERE f.workspace_id = 'default'
            AND NOT EXISTS (
              SELECT 1
                FROM folders other
               WHERE other.workspace_id = f.workspace_id
                 AND other.id <> f.id
            )
       )
     WHERE folder_id IS NULL
       AND EXISTS (
         SELECT 1
           FROM folders f
          WHERE f.workspace_id = 'default'
            AND NOT EXISTS (
              SELECT 1
                FROM folders other
               WHERE other.workspace_id = f.workspace_id
                 AND other.id <> f.id
            )
       );
  `,
};
