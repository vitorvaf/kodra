import { useCallback, useEffect, useRef, useState } from 'react';

export type Mutator<T> = (next: T | null | ((prev: T | null) => T | null)) => void;

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  mutate: Mutator<T>;
  refetch: () => Promise<void>;
}

interface InternalState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useFetch<T>(key: string | null, fetcher: () => Promise<T>): FetchState<T> {
  const [state, setState] = useState<InternalState<T>>({
    data: null,
    loading: key !== null,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    fetcherRef.current().then(
      (data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      },
      (err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, loading: false, error }));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [key]);

  const mutate = useCallback<Mutator<T>>((next) => {
    setState((prev) => {
      const resolved =
        typeof next === 'function' ? (next as (p: T | null) => T | null)(prev.data) : next;
      return { ...prev, data: resolved };
    });
  }, []);

  const refetch = useCallback(async (): Promise<void> => {
    try {
      const data = await fetcherRef.current();
      setState({ data, loading: false, error: null });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState((prev) => ({ ...prev, loading: false, error }));
    }
  }, []);

  return { ...state, mutate, refetch };
}
