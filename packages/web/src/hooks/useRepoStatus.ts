import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import type { WorkspaceRepoStatus } from '../types.js';

/**
 * Per-repo git status hook for the rail switcher menu. Caches the result
 * in-memory keyed on (repoId, sequence) so a row that re-mounts after a
 * dropdown re-open reuses a fresh value without re-shelling out. The
 * cache TTL is 30s — long enough that pointer movement and re-opens
 * don't fan out a git poll per row, short enough that the next deliberate
 * open shows a usable snapshot.
 *
 * Pass `refreshKey` to invalidate the cached value (e.g. when the
 * dropdown re-opens). The hook re-fetches whenever `repoId` or
 * `refreshKey` change.
 */
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  status: WorkspaceRepoStatus;
  fetchedAt: number;
}

const cache = new Map<number, CacheEntry>();

export interface UseRepoStatusAPI {
  status: WorkspaceRepoStatus | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useRepoStatus(
  repoId: number | null,
  refreshKey?: number,
): UseRepoStatusAPI {
  const [status, setStatus] = useState<WorkspaceRepoStatus | null>(() => {
    if (repoId === null) return null;
    const cached = cache.get(repoId);
    if (!cached) return null;
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
    return cached.status;
  });
  const [loading, setLoading] = useState(false);
  const cancelRef = useRef(false);

  const fetchStatus = useCallback(
    async (id: number, allowCache: boolean): Promise<void> => {
      if (allowCache) {
        const cached = cache.get(id);
        if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL_MS) {
          setStatus(cached.status);
          setLoading(false);
          return;
        }
      }
      setLoading(true);
      try {
        const result = await api.getWorkspaceRepoStatus(id);
        cache.set(id, { status: result, fetchedAt: Date.now() });
        if (!cancelRef.current) {
          setStatus(result);
        }
      } catch {
        if (!cancelRef.current) {
          setStatus(null);
        }
      } finally {
        if (!cancelRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    cancelRef.current = false;
    if (repoId === null) {
      setStatus(null);
      setLoading(false);
      return;
    }
    void fetchStatus(repoId, true);
    return () => {
      cancelRef.current = true;
    };
  }, [repoId, refreshKey, fetchStatus]);

  const refetch = useCallback(async () => {
    if (repoId === null) return;
    await fetchStatus(repoId, false);
  }, [repoId, fetchStatus]);

  return { status, loading, refetch };
}
