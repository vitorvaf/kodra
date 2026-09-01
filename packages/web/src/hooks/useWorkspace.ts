import { useFetch } from './useFetch.js';
import { api } from '../api.js';
import { useIssues } from './useIssues.js';
import type { Workspace, WorkspaceFolderPayload } from '../types.js';

export interface WorkspaceFolder {
  id: string;
  name: string;
  path: string;
  branch: string;
  activeAgents: number;
  issues: number;
  current: boolean;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  activeAgents: number;
}

export interface WorkspaceState {
  workspace: WorkspaceMeta;
  folders: WorkspaceFolder[];
  currentFolderId: string;
  setCurrentFolder: (id: string) => void;
  loading: boolean;
  error: Error | null;
}

const FALLBACK_WORKSPACE: Workspace = {
  id: 'default',
  name: 'kanbots workspace',
  currentFolderId: 'unknown',
};

export function useWorkspace(): WorkspaceState {
  const ws = useFetch<Workspace>('workspace', () => api.workspace());
  const folders = useFetch<WorkspaceFolderPayload[]>('folders', () => api.listFolders());
  const { issues } = useIssues();

  const workspace = ws.data ?? FALLBACK_WORKSPACE;
  const list = folders.data ?? [];

  // Issues are scoped to the active folder for now (single-folder runtime).
  // Phase 11 may extend the API to scope by folderId.
  const activeAgents = issues.filter(
    (i) => i.agent === 'running' || i.agent === 'blocked',
  ).length;

  const decorated: WorkspaceFolder[] = list.map((f) => ({
    id: f.id,
    name: f.name,
    path: f.path,
    branch: f.defaultBranch,
    activeAgents: f.current ? activeAgents : 0,
    issues: f.current ? issues.length : 0,
    current: f.current,
  }));

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      activeAgents,
    },
    folders: decorated,
    currentFolderId: workspace.currentFolderId,
    setCurrentFolder: () => undefined, // Phase 11 wires real folder switching
    loading: ws.loading || folders.loading,
    error: ws.error ?? folders.error,
  };
}
