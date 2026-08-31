import { useEffect, useState } from 'react';
import { isValidCustomIssueId, parseIssueRef, type IssueRef } from '@kanbots/core';

const SELECTION_HASH_KEY = 'sel';

function parseSelection(value: string): IssueRef | null {
  return isValidCustomIssueId(value) ? parseIssueRef(value) : null;
}

function readFromHash(): IssueRef | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.slice(1);
  // Parse "?sel=412" or "/issue/412" or "/?sel=412"
  const issueMatch = /^\/issue\/([A-Za-z0-9][A-Za-z0-9._-]{0,31})/.exec(hash);
  if (issueMatch?.[1]) return parseSelection(issueMatch[1]);
  const queryStart = hash.indexOf('?');
  const query = queryStart === -1 ? '' : hash.slice(queryStart + 1);
  if (query) {
    const params = new URLSearchParams(query);
    const v = params.get(SELECTION_HASH_KEY);
    if (v !== null) {
      const n = parseSelection(v);
      if (n !== null) return n;
    }
  }
  return null;
}

function writeToHash(next: IssueRef | null): void {
  if (typeof window === 'undefined') return;
  const raw = window.location.hash.slice(1);
  const issueMatch = /^\/issue\/([A-Za-z0-9][A-Za-z0-9._-]{0,31})/.exec(raw);
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

export function useSelection(): [IssueRef | null, (n: IssueRef | null) => void] {
  const [value, setValue] = useState<IssueRef | null>(() => readFromHash());

  useEffect(() => {
    const onChange = (): void => setValue(readFromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  function set(next: IssueRef | null): void {
    writeToHash(next);
    setValue(next);
  }

  return [value, set];
}
