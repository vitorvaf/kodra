import { useCallback, useEffect } from 'react';
import { useFetch } from './useFetch.js';
import { api } from '../api.js';
import { useIssues } from './useIssues.js';
import type { Workspace, WorkspaceFolderPayload } from '../types.js';
import { useCurrentFolderId, usePrefsStore } from '../stores/usePrefsStore.js';

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
  name: 'Kodra workspace',
  currentFolderId: 'unknown',
};

export function useWorkspace(): WorkspaceState {
  const ws = useFetch<Workspace>('workspace', () => api.workspace());
  const folders = useFetch<WorkspaceFolderPayload[]>('folders', () => api.listFolders());
  const { issues } = useIssues();

  const workspace = ws.data ?? FALLBACK_WORKSPACE;
  const list = folders.data ?? [];
  const persistedFolderId = useCurrentFolderId();
  const setPersistedFolderId = usePrefsStore((s) => s.setCurrentFolderId);
  const selectedFolderId =
    (persistedFolderId !== null && list.some((f) => f.id === persistedFolderId)
      ? persistedFolderId
      : list.find((f) => f.current)?.id) ?? list[0]?.id ?? workspace.currentFolderId;

  useEffect(() => {
    if (selectedFolderId !== 'unknown' && selectedFolderId !== persistedFolderId) {
      setPersistedFolderId(selectedFolderId);
    }
  }, [selectedFolderId, persistedFolderId, setPersistedFolderId]);

  // `useIssues` follows the persisted current-folder selection, so these
  // counts describe the folder shown by the board rather than the whole DB.
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
    current: f.id === selectedFolderId,
  }));

  const setCurrentFolder = useCallback(
    (id: string): void => {
      if (list.some((f) => f.id === id)) setPersistedFolderId(id);
    },
    [list, setPersistedFolderId],
  );

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      activeAgents,
    },
    folders: decorated,
    currentFolderId: selectedFolderId,
    setCurrentFolder,
    loading: ws.loading || folders.loading,
    error: ws.error ?? folders.error,
  };
}
