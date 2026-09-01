import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Multi-select state for the board. Selection is ephemeral per session —
 * it lives in component state, never crosses a tab refresh. A separate
 * "anchor" tracks the last toggled card so shift-range-selects know
 * where to start from.
 *
 * `selectRange(from, to, byPosition)` accepts an array of issue numbers
 * in their currently-rendered order so the caller can decide whether
 * a range spans across columns or stays within one — both are valid UX
 * shapes and we don't want to bake the policy here.
 */
export interface CardSelectionAPI {
  selected: ReadonlySet<number>;
  anchor: number | null;
  isSelected: (n: number) => boolean;
  toggle: (n: number) => void;
  add: (n: number) => void;
  remove: (n: number) => void;
  clear: () => void;
  /**
   * Select every card between `from` (the previous anchor) and `to`
   * inclusive, walking the order in `byPosition`. If `from` is null or
   * not present in `byPosition`, behaves as a single-card toggle on
   * `to` so the user always gets visual feedback.
   */
  selectRange: (from: number | null, to: number, byPosition: readonly number[]) => void;
}

export function useCardSelection(): CardSelectionAPI {
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  // anchorRef holds the last-toggled issue number so range selects can
  // span from it to the next click. We mirror it into state so renderer
  // hooks that read `anchor` (e.g. the bulk action bar) re-render when
  // it changes, but use a ref inside callbacks to avoid the stale-closure
  // problem of multiple toggles within the same render.
  const anchorRef = useRef<number | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);

  const setAnchorBoth = useCallback((next: number | null): void => {
    anchorRef.current = next;
    setAnchor(next);
  }, []);

  const isSelected = useCallback((n: number) => selected.has(n), [selected]);

  const toggle = useCallback(
    (n: number): void => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(n)) next.delete(n);
        else next.add(n);
        return next;
      });
      setAnchorBoth(n);
    },
    [setAnchorBoth],
  );

  const add = useCallback(
    (n: number): void => {
      setSelected((prev) => {
        if (prev.has(n)) return prev;
        const next = new Set(prev);
        next.add(n);
        return next;
      });
      setAnchorBoth(n);
    },
    [setAnchorBoth],
  );

  const remove = useCallback(
    (n: number): void => {
      setSelected((prev) => {
        if (!prev.has(n)) return prev;
        const next = new Set(prev);
        next.delete(n);
        return next;
      });
    },
    [],
  );

  const clear = useCallback((): void => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
    setAnchorBoth(null);
  }, [setAnchorBoth]);

  const selectRange = useCallback(
    (from: number | null, to: number, byPosition: readonly number[]): void => {
      const fromIdx = from === null ? -1 : byPosition.indexOf(from);
      const toIdx = byPosition.indexOf(to);
      if (toIdx === -1) return;
      if (fromIdx === -1) {
        // No valid anchor — promote `to` to a single-card add so the user
        // sees feedback rather than a no-op.
        add(to);
        return;
      }
      const lo = Math.min(fromIdx, toIdx);
      const hi = Math.max(fromIdx, toIdx);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) {
          const n = byPosition[i];
          if (n !== undefined) next.add(n);
        }
        return next;
      });
      setAnchorBoth(to);
    },
    [add, setAnchorBoth],
  );

  return useMemo(
    () => ({
      selected,
      anchor,
      isSelected,
      toggle,
      add,
      remove,
      clear,
      selectRange,
    }),
    [selected, anchor, isSelected, toggle, add, remove, clear, selectRange],
  );
}
