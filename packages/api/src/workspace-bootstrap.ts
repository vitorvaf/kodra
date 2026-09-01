import type { Folder, Store, Workspace } from '@kanbots/local-store';
import type { Config } from './bridge.js';

export interface WorkspaceBootstrapResult {
  workspace: Workspace;
  currentFolder: Folder;
}

const DEFAULT_WORKSPACE_ID = 'default';
const DEFAULT_WORKSPACE_NAME = 'kanbots workspace';

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
  return { workspace, currentFolder };
}

export const DEFAULT_WORKSPACE_ID_CONST = DEFAULT_WORKSPACE_ID;
