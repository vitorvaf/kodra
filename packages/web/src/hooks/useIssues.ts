import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { api } from '../api.js';
import { useFetch, type Mutator } from './useFetch.js';
import type { Issue } from '../types.js';
import { useCurrentFolderId } from '../stores/usePrefsStore.js';

export interface IssuesContextValue {
  issues: Issue[];
  loading: boolean;
  error: Error | null;
  mutate: Mutator<Issue[]>;
  refetch: () => Promise<void>;
}

const IssuesContext = createContext<IssuesContextValue | null>(null);

export const ISSUES_REFETCH_EVENT = 'kanbots:issues-refetch';
export const ISSUES_CHANGED_CHANNEL = 'issues:changed';
export const CHECKS_CHANGED_CHANNEL = 'checks:changed';

export function IssuesProvider({ children }: { children: ReactNode }) {
  const folderId = useCurrentFolderId();
  const { data, loading, error, mutate, refetch } = useFetch(
    `issues:open:${folderId ?? 'all'}`,
    () => api.issues('open', folderId ?? undefined),
  );

  // Coalesce bursts of change events so a flurry of label/run updates
  // results in at most one refetch per ~80ms window.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefetch = useCallback(() => {
    if (debounceRef.current !== null) return;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void refetch();
    }, 80);
  }, [refetch]);

  useEffect(() => {
    function onEvent(): void {
      debouncedRefetch();
    }
    window.addEventListener(ISSUES_REFETCH_EVENT, onEvent);
    return () => window.removeEventListener(ISSUES_REFETCH_EVENT, onEvent);
  }, [debouncedRefetch]);

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
    if (!bridge) return;
    return bridge.subscribe(ISSUES_CHANGED_CHANNEL, () => {
      debouncedRefetch();
    });
  }, [debouncedRefetch]);

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
    if (!bridge) return;
    return bridge.subscribe(CHECKS_CHANGED_CHANNEL, () => {
      debouncedRefetch();
    });
  }, [debouncedRefetch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const value = useMemo(
    () => ({ issues: data ?? [], loading, error, mutate, refetch }),
    [data, loading, error, mutate, refetch],
  );

  return createElement(
    IssuesContext.Provider,
    { value },
    children,
  );
}

export function useIssues(): IssuesContextValue {
  const v = useContext(IssuesContext);
  if (!v) throw new Error('useIssues must be used inside <IssuesProvider>');
  return v;
}

export function dispatchIssuesRefetch(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ISSUES_REFETCH_EVENT));
}
