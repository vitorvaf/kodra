import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { usePrefsStore } from '../stores/usePrefsStore.js';
import type { WorkspaceRepoPayload } from '../types.js';

const REPOS_CHANGED_EVENT = 'kanbots:workspace-repos-changed';

/**
 * Fire after mutating workspace_repos (add/remove/rename/primary-swap) so
 * every mounted `useFocusedRepo` instance refetches. Cheap fan-out via a
 * window-level CustomEvent — the rail switcher, dispatch caption, and any
 * future surfaces stay in sync without prop drilling.
 */
export function dispatchWorkspaceReposChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REPOS_CHANGED_EVENT));
}

export interface UseFocusedRepoAPI {
  repos: WorkspaceRepoPayload[];
  focused: WorkspaceRepoPayload | null;
  /** numeric id; null means "use primary" */
  focusedRepoId: number | null;
  setFocusedRepoId: (id: number | null) => void;
  refetch: () => Promise<void>;
  loading: boolean;
}

/**
 * Tracks which workspace repo dispatch surfaces should target. The persisted
 * `focusedRepoId` lives in the unified prefs store (`usePrefsStore`); the
 * repo list itself is fetched on demand and kept locally — it's server
 * state, not user prefs.
 *
 * Semantics:
 * - `focused` resolves to the explicitly-chosen repo when set, otherwise the
 *   workspace's primary repo, otherwise null (empty workspace / single-repo
 *   pre-migration setups).
 * - `focusedRepoId` is the value to pass to dispatch IPC channels — null
 *   means "let the supervisor pick the primary".
 * - If the persisted id no longer matches a real repo (e.g. the user removed
 *   the repo from another window), we fall back to null on the next refetch.
 */
export function useFocusedRepo(): UseFocusedRepoAPI {
  const [repos, setRepos] = useState<WorkspaceRepoPayload[]>([]);
  const focusedRepoId = usePrefsStore((s) => s.focusedRepoId);
  const setFocusedRepoIdStore = usePrefsStore((s) => s.setFocusedRepoId);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const list = await api.listWorkspaceRepos();
      setRepos(list);
    } catch {
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Listen for cross-component mutations so every hook instance refetches
  // when the user adds/removes a repo via the settings modal — without
  // requiring callers to thread a refetch callback through.
  useEffect(() => {
    function onChanged(): void {
      void refetch();
    }
    if (typeof window === 'undefined') return;
    window.addEventListener(REPOS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(REPOS_CHANGED_EVENT, onChanged);
  }, [refetch]);

  // If the persisted id no longer matches a real repo, fall back to null (primary).
  useEffect(() => {
    if (focusedRepoId === null) return;
    if (repos.length === 0) return; // wait for load
    if (!repos.some((r) => r.id === focusedRepoId)) {
      setFocusedRepoIdStore(null);
    }
  }, [focusedRepoId, repos, setFocusedRepoIdStore]);

  const setFocusedRepoId = useCallback(
    (id: number | null) => {
      setFocusedRepoIdStore(id);
    },
    [setFocusedRepoIdStore],
  );

  const focused =
    focusedRepoId !== null
      ? (repos.find((r) => r.id === focusedRepoId) ?? null)
      : (repos.find((r) => r.isPrimary) ?? null);

  return { repos, focused, focusedRepoId, setFocusedRepoId, refetch, loading };
}
