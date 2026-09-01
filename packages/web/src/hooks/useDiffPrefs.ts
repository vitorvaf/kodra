import { useCallback } from 'react';
import {
  DIFF_PREFS_DEFAULTS as STORE_DIFF_PREFS_DEFAULTS,
  usePrefsStore,
  type DiffPrefs as StoreDiffPrefs,
  type DiffViewMode as StoreDiffViewMode,
} from '../stores/usePrefsStore.js';

export type DiffViewMode = StoreDiffViewMode;
export type DiffPrefs = StoreDiffPrefs;

// Re-exported so existing imports (`import { DIFF_PREFS_DEFAULTS } from
// '../hooks/useDiffPrefs.js'`) keep working after the unified store moved
// the source of truth.
export const DIFF_PREFS_DEFAULTS = STORE_DIFF_PREFS_DEFAULTS;

/**
 * Thin wrapper around the unified prefs store. Kept so existing call sites
 * (FileChangeViewer, etc.) don't need to change shape — they still get the
 * `{ prefs, set, toggleMode }` API. Internally the state lives in
 * `usePrefsStore` under the `diff` slice and is persisted to the canonical
 * `kanbots:prefs` localStorage key.
 *
 * New code is encouraged to read scoped selectors directly:
 *   const mode = useDiffMode();
 *   const ignore = useDiffIgnoreWhitespace();
 *   const setDiffMode = usePrefsStore((s) => s.setDiffMode);
 */
export function useDiffPrefs(): {
  prefs: DiffPrefs;
  set: <K extends keyof DiffPrefs>(key: K, value: DiffPrefs[K]) => void;
  toggleMode: () => void;
} {
  const prefs = usePrefsStore((s) => s.diff);
  const setDiffPref = usePrefsStore((s) => s.setDiffPref);
  const setDiffMode = usePrefsStore((s) => s.setDiffMode);

  const set = useCallback(
    <K extends keyof DiffPrefs>(key: K, value: DiffPrefs[K]) => {
      setDiffPref(key, value);
    },
    [setDiffPref],
  );

  const toggleMode = useCallback(() => {
    setDiffMode(prefs.mode === 'unified' ? 'split' : 'unified');
  }, [prefs.mode, setDiffMode]);

  return { prefs, set, toggleMode };
}
