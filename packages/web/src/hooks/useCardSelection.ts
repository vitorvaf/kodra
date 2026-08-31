import { useCallback, useMemo, useRef, useState } from 'react';
import type { IssueRef } from '@kanbots/core';

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
  selected: ReadonlySet<IssueRef>;
  anchor: IssueRef | null;
  isSelected: (n: IssueRef) => boolean;
  toggle: (n: IssueRef) => void;
  add: (n: IssueRef) => void;
  remove: (n: IssueRef) => void;
  clear: () => void;
  /**
   * Select every card between `from` (the previous anchor) and `to`
   * inclusive, walking the order in `byPosition`. If `from` is null or
   * not present in `byPosition`, behaves as a single-card toggle on
   * `to` so the user always gets visual feedback.
   */
  selectRange: (from: IssueRef | null, to: IssueRef, byPosition: readonly IssueRef[]) => void;
}

function sameIssue(a: IssueRef, b: IssueRef): boolean {
  return String(a) === String(b);
}

export function useCardSelection(): CardSelectionAPI {
  const [selected, setSelected] = useState<ReadonlySet<IssueRef>>(() => new Set());
  // anchorRef holds the last-toggled issue number so range selects can
  // span from it to the next click. We mirror it into state so renderer
  // hooks that read `anchor` (e.g. the bulk action bar) re-render when
  // it changes, but use a ref inside callbacks to avoid the stale-closure
  // problem of multiple toggles within the same render.
  const anchorRef = useRef<IssueRef | null>(null);
  const [anchor, setAnchor] = useState<IssueRef | null>(null);

  const setAnchorBoth = useCallback((next: IssueRef | null): void => {
    anchorRef.current = next;
    setAnchor(next);
  }, []);

  const isSelected = useCallback(
    (n: IssueRef) => [...selected].some((selectedRef) => sameIssue(selectedRef, n)),
    [selected],
  );

  const toggle = useCallback(
    (n: IssueRef): void => {
      setSelected((prev) => {
        const next = new Set(prev);
        const existing = [...next].find((selectedRef) => sameIssue(selectedRef, n));
        if (existing !== undefined) next.delete(existing);
        else next.add(n);
        return next;
      });
      setAnchorBoth(n);
    },
    [setAnchorBoth],
  );

  const add = useCallback(
    (n: IssueRef): void => {
      setSelected((prev) => {
        if ([...prev].some((selectedRef) => sameIssue(selectedRef, n))) return prev;
        const next = new Set(prev);
        next.add(n);
        return next;
      });
      setAnchorBoth(n);
    },
    [setAnchorBoth],
  );

  const remove = useCallback(
    (n: IssueRef): void => {
      setSelected((prev) => {
        const next = new Set(prev);
        const existing = [...next].find((selectedRef) => sameIssue(selectedRef, n));
        if (existing === undefined) return prev;
        next.delete(existing);
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
    (from: IssueRef | null, to: IssueRef, byPosition: readonly IssueRef[]): void => {
      const fromIdx =
        from === null ? -1 : byPosition.findIndex((n) => String(n) === String(from));
      const toIdx = byPosition.findIndex((n) => String(n) === String(to));
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
          if (
            n !== undefined &&
            ![...next].some((selectedRef) => sameIssue(selectedRef, n))
          ) {
            next.add(n);
          }
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
