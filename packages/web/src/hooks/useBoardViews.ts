import { useCallback, useEffect, useMemo } from 'react';
import {
  usePrefsStore,
  type BoardView as StoreBoardView,
  type BoardViewFilters as StoreBoardViewFilters,
  type BoardViewSortMode as StoreBoardViewSortMode,
  type BoardViewState as StoreBoardViewState,
} from '../stores/usePrefsStore.js';
import type { Priority } from '../labels.js';

export type BoardViewSortMode = StoreBoardViewSortMode;

/**
 * Serialised filter shape persisted alongside a view. Mirrors the live
 * `BoardFilters` state from `useBoardFilters`, but stores arrays rather
 * than Sets so persisted state round-trips cleanly. The renderer rebuilds
 * Sets when applying the view.
 *
 * The unified store keeps `priorities` as `string[]` to avoid pulling the
 * label-domain `Priority` union into the store layer; we re-narrow here for
 * call-site type safety.
 */
export interface BoardViewFilters extends Omit<StoreBoardViewFilters, 'priorities'> {
  priorities: Priority[];
}

export interface BoardViewState extends Omit<StoreBoardViewState, 'filters'> {
  filters: BoardViewFilters;
}

export interface BoardView extends Omit<StoreBoardView, 'filters'> {
  filters: BoardViewFilters;
}

function makeId(): string {
  // Lightweight uuid — random base36 + timestamp suffix, plenty for the
  // local-only audience here. Crypto.randomUUID isn't on every Electron
  // version we support, so we hand-roll.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// "Triage" used to also flip a Sentry-imported filter; that filter isn't
// tracked in the live BoardFilters today, so the default just shows the
// backlog in newest-first order — once the renderer adds a Sentry filter
// we can extend BoardViewFilters and bump the seed.
const SEED_DEFAULTS: ReadonlyArray<Omit<BoardView, 'id' | 'createdAt'>> = [
  {
    name: 'Active',
    filters: { hasAgent: false, priorities: [], areas: [] },
    sortMode: 'updatedAt',
    includeBacklog: false,
  },
  {
    name: 'Awaiting',
    filters: { hasAgent: true, priorities: [], areas: [] },
    sortMode: 'priority',
    includeBacklog: false,
  },
  {
    name: 'Triage',
    filters: { hasAgent: false, priorities: [], areas: [] },
    sortMode: 'createdAt',
    includeBacklog: true,
  },
];

export interface BoardViewsAPI {
  views: BoardView[];
  activeViewId: string | null;
  setActiveView: (id: string | null) => void;
  saveView: (name: string, state: BoardViewState) => BoardView;
  updateView: (id: string, patch: Partial<Omit<BoardView, 'id' | 'createdAt'>>) => void;
  deleteView: (id: string) => void;
  reorderViews: (ids: string[]) => void;
}

const EMPTY_VIEWS: BoardView[] = [];

export function useBoardViews(workspaceId: string | null): BoardViewsAPI {
  const wsBoardViews = usePrefsStore((s) =>
    workspaceId === null ? null : (s.boardViews[workspaceId] ?? null),
  );
  const setWorkspaceBoardViews = usePrefsStore((s) => s.setWorkspaceBoardViews);
  const setActiveBoardView = usePrefsStore((s) => s.setActiveBoardView);
  const upsertBoardView = usePrefsStore((s) => s.upsertBoardView);
  const patchBoardView = usePrefsStore((s) => s.patchBoardView);
  const deleteBoardViewAction = usePrefsStore((s) => s.deleteBoardView);
  const reorderBoardViewsAction = usePrefsStore((s) => s.reorderBoardViews);
  const markWorkspaceSeeded = usePrefsStore((s) => s.markWorkspaceSeeded);

  // Seed defaults once per workspace, mirroring the legacy seed-key
  // semantics: if the workspace has no recorded views AND we've never seeded
  // it, drop in the three default views. After seeding we mark
  // `seeded: true` so we never re-seed even if the user deletes everything.
  useEffect(() => {
    if (workspaceId === null) return;
    const current = usePrefsStore.getState().boardViews[workspaceId] ?? null;
    if (current !== null && current.seeded) return;
    if (current !== null && current.views.length > 0) {
      // User has views but no seed flag (e.g. migrated from legacy). Just
      // flip the flag so we don't seed on top of them.
      markWorkspaceSeeded(workspaceId);
      return;
    }
    const now = new Date().toISOString();
    const seeded: StoreBoardView[] = SEED_DEFAULTS.map((v) => ({
      ...v,
      id: makeId(),
      createdAt: now,
    }));
    setWorkspaceBoardViews(workspaceId, {
      views: seeded,
      activeViewId: null,
      seeded: true,
    });
  }, [workspaceId, markWorkspaceSeeded, setWorkspaceBoardViews]);

  const views = (wsBoardViews?.views ?? EMPTY_VIEWS) as BoardView[];
  const activeViewId = wsBoardViews?.activeViewId ?? null;

  const setActiveView = useCallback(
    (id: string | null): void => {
      if (workspaceId === null) return;
      setActiveBoardView(workspaceId, id);
    },
    [workspaceId, setActiveBoardView],
  );

  const saveView = useCallback(
    (name: string, state: BoardViewState): BoardView => {
      const view: BoardView = {
        ...state,
        id: makeId(),
        name,
        createdAt: new Date().toISOString(),
      };
      if (workspaceId !== null) {
        upsertBoardView(workspaceId, view as StoreBoardView);
      }
      return view;
    },
    [workspaceId, upsertBoardView],
  );

  const updateView = useCallback(
    (id: string, patch: Partial<Omit<BoardView, 'id' | 'createdAt'>>): void => {
      if (workspaceId === null) return;
      patchBoardView(workspaceId, id, patch as Partial<Omit<StoreBoardView, 'id' | 'createdAt'>>);
    },
    [workspaceId, patchBoardView],
  );

  const deleteView = useCallback(
    (id: string): void => {
      if (workspaceId === null) return;
      deleteBoardViewAction(workspaceId, id);
    },
    [workspaceId, deleteBoardViewAction],
  );

  const reorderViews = useCallback(
    (ids: string[]): void => {
      if (workspaceId === null) return;
      reorderBoardViewsAction(workspaceId, ids);
    },
    [workspaceId, reorderBoardViewsAction],
  );

  return useMemo(
    () => ({
      views,
      activeViewId,
      setActiveView,
      saveView,
      updateView,
      deleteView,
      reorderViews,
    }),
    [
      views,
      activeViewId,
      setActiveView,
      saveView,
      updateView,
      deleteView,
      reorderViews,
    ],
  );
}

/**
 * Compare two view-state values structurally. Used by the renderer to
 * detect whether the current state matches an existing view (so the
 * dropdown can show the view name instead of "Custom").
 */
export function boardViewStateEqual(a: BoardViewState, b: BoardViewState): boolean {
  if (a.sortMode !== b.sortMode) return false;
  if (a.includeBacklog !== b.includeBacklog) return false;
  if (a.filters.hasAgent !== b.filters.hasAgent) return false;
  if (a.filters.priorities.length !== b.filters.priorities.length) return false;
  if (a.filters.areas.length !== b.filters.areas.length) return false;
  const aP = new Set(a.filters.priorities);
  for (const p of b.filters.priorities) if (!aP.has(p)) return false;
  const aA = new Set(a.filters.areas);
  for (const ar of b.filters.areas) if (!aA.has(ar)) return false;
  return true;
}
