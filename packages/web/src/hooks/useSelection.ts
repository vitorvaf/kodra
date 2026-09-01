import { useEffect, useState } from 'react';

const SELECTION_HASH_KEY = 'sel';

function readFromHash(): number | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.slice(1);
  // Parse "?sel=412" or "/issue/412" or "/?sel=412"
  const issueMatch = /^\/issue\/(\d+)/.exec(hash);
  if (issueMatch?.[1]) return Number.parseInt(issueMatch[1], 10);
  const queryStart = hash.indexOf('?');
  const query = queryStart === -1 ? '' : hash.slice(queryStart + 1);
  if (query) {
    const params = new URLSearchParams(query);
    const v = params.get(SELECTION_HASH_KEY);
    if (v !== null) {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function writeToHash(next: number | null): void {
  if (typeof window === 'undefined') return;
  const raw = window.location.hash.slice(1);
  const issueMatch = /^\/issue\/(\d+)/.exec(raw);
  if (issueMatch) {
    // Issue route always has its own selection encoded in the path.
    window.location.hash = next === null ? '/' : `/issue/${next}`;
    return;
  }
  const queryStart = raw.indexOf('?');
  const path = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const query = queryStart === -1 ? '' : raw.slice(queryStart + 1);
  const params = new URLSearchParams(query);
  if (next === null) params.delete(SELECTION_HASH_KEY);
  else params.set(SELECTION_HASH_KEY, String(next));
  const queryStr = params.toString();
  const target = queryStr ? `${path}?${queryStr}` : path || '/';
  window.location.hash = target;
}

export function useSelection(): [number | null, (n: number | null) => void] {
  const [value, setValue] = useState<number | null>(() => readFromHash());

  useEffect(() => {
    const onChange = (): void => setValue(readFromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  function set(next: number | null): void {
    writeToHash(next);
    setValue(next);
  }

  return [value, set];
}
