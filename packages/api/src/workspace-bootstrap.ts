import type { Folder, Store, Workspace } from '@kanbots/local-store';
import type { Config } from './bridge.js';

export interface WorkspaceBootstrapResult {
  workspace: Workspace;
  currentFolder: Folder;
}

const DEFAULT_WORKSPACE_ID = 'default';
const DEFAULT_WORKSPACE_NAME = 'kodra workspace';

function folderIdFor(config: Config, repoPath: string): string {
  const slug =
    (config.mode === 'local' ? config.repo : `${config.owner}-${config.repo}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'folder';
  // Repo path is the disambiguator across two folders with the same name.
  const pathHash = repoPath
    .split('/')
    .filter(Boolean)
    .slice(-3)
    .join('-')
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase();
  return `${slug}-${pathHash}`;
}

export function bootstrapWorkspace(
  store: Store,
  config: Config,
  repoPath: string,
): WorkspaceBootstrapResult {
  const workspace = store.workspaces.ensure({
    id: DEFAULT_WORKSPACE_ID,
    name: DEFAULT_WORKSPACE_NAME,
  });
  const folderName = config.mode === 'local' ? config.repo : `${config.owner}/${config.repo}`;
  const currentFolder = store.folders.ensure({
    id: folderIdFor(config, repoPath),
    workspaceId: workspace.id,
    name: folderName,
    path: repoPath,
    defaultBranch: 'main',
  });
  // Migration 0032 can only backfill folders that already existed when the
  // database was opened. Older stores may create their first folder here,
  // after migrations have run, so attach otherwise-unscoped legacy issues at
  // the same point while the folder is still unambiguous.
  store.db
    .prepare(
      `UPDATE local_issues
          SET folder_id = ?
        WHERE folder_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM folders other
             WHERE other.workspace_id = ? AND other.id <> ?
          )`,
    )
    .run(currentFolder.id, workspace.id, currentFolder.id);
  return { workspace, currentFolder };
}

export const DEFAULT_WORKSPACE_ID_CONST = DEFAULT_WORKSPACE_ID;
