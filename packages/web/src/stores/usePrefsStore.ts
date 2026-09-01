import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

// ARCHITECTURE: industry-standard Zustand + `persist` pattern — one global
// store for user UI preferences, persisted to localStorage. Replaces four
// hand-rolled hooks (useDiffPrefs, useFocusedRepo, useTweaks, useBoardViews)
// plus two inline localStorage call-sites (Board.tsx sortMode,
// useBoardFilters includeBacklog) that each duplicated parse / serialize /
// migration plumbing. Selectors are exported per-slice so component
// re-renders stay scoped — Zustand uses ref-equality per selector by default.
//
// Migration story:
//   - One canonical key: `kanbots:prefs` (versioned via persist middleware).
//   - On first load with a new version (or no stored state), the migrate
//     function reads the six legacy keys + per-workspace board-view keys
//     and seeds the store. Subsequent writes use only `kanbots:prefs`.
//   - The legacy keys are kept in place for one release so a downgrade is
//     non-destructive. They can be swept once `version` is bumped again.
//
// Why one store, not four:
//   - Centralised migration story (today there is none).
//   - Per-slice subscribers — components re-render only when their slice
//     changes, rather than every consumer re-rendering on every pref edit.
//   - DevTools integration (Zustand exposes a Redux-style devtools middle-
//     ware we can add behind a flag later).
//   - Same library that ships on most modern desktop-shell React stacks
//     (~3 KB gzipped, no Provider, no context). Smallest dep that covers
//     the job — see research notes for the side-by-side evaluation.

export type DiffViewMode = 'unified' | 'split';
export type Theme = 'dark' | 'paper';
export type BoardSortMode = 'manual' | 'priority' | 'createdAt' | 'updatedAt';
export type BoardViewSortMode = BoardSortMode;

// Mirrors the legacy BoardViewFilters / BoardView shape from useBoardViews so
// migration is structurally identity (no field renames).
export interface BoardViewFilters {
  hasAgent: boolean;
  priorities: string[]; // Priority union, stored loosely so the store stays free of label-domain imports
  areas: string[];
}

export interface BoardViewState {
  filters: BoardViewFilters;
  sortMode: BoardViewSortMode;
  includeBacklog: boolean;
}

export interface BoardView extends BoardViewState {
  id: string;
  name: string;
  createdAt: string;
}

export interface WorkspaceBoardViews {
  views: BoardView[];
  activeViewId: string | null;
  /** True once the seed defaults have been written for this workspace. */
  seeded: boolean;
}

export interface DiffPrefs {
  mode: DiffViewMode;
  ignoreWhitespace: boolean;
}

export interface Tweaks {
  theme: Theme;
  accentHue: number;
  showRail: boolean;
  showTray: boolean;
}

export interface BoardPrefs {
  sortMode: BoardSortMode;
  includeBacklog: boolean;
}

interface PrefsState {
  diff: DiffPrefs;
  focusedRepoId: number | null;
  boardViews: Record<string /* workspaceId */, WorkspaceBoardViews>;
  tweaks: Tweaks;
  board: BoardPrefs;
}

interface PrefsActions {
  setDiffMode: (mode: DiffViewMode) => void;
  setDiffIgnoreWhitespace: (value: boolean) => void;
  setDiffPref: <K extends keyof DiffPrefs>(key: K, value: DiffPrefs[K]) => void;

  setFocusedRepoId: (id: number | null) => void;

  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
  resetTweaks: () => void;

  setBoardSortMode: (mode: BoardSortMode) => void;
  setBoardIncludeBacklog: (value: boolean) => void;

  // Board-views per-workspace API
  setWorkspaceBoardViews: (workspaceId: string, store: WorkspaceBoardViews) => void;
  setActiveBoardView: (workspaceId: string, id: string | null) => void;
  upsertBoardView: (workspaceId: string, view: BoardView) => void;
  patchBoardView: (
    workspaceId: string,
    id: string,
    patch: Partial<Omit<BoardView, 'id' | 'createdAt'>>,
  ) => void;
  deleteBoardView: (workspaceId: string, id: string) => void;
  reorderBoardViews: (workspaceId: string, ids: string[]) => void;
  markWorkspaceSeeded: (workspaceId: string) => void;
}

export const DIFF_PREFS_DEFAULTS: DiffPrefs = {
  mode: 'unified',
  ignoreWhitespace: true,
};

export const TWEAK_DEFAULTS: Tweaks = {
  theme: 'dark',
  accentHue: 45,
  showRail: true,
  showTray: true,
};

export const BOARD_PREFS_DEFAULTS: BoardPrefs = {
  sortMode: 'manual',
  includeBacklog: false,
};

const DEFAULT_STATE: PrefsState = {
  diff: DIFF_PREFS_DEFAULTS,
  focusedRepoId: null,
  boardViews: {},
  tweaks: TWEAK_DEFAULTS,
  board: BOARD_PREFS_DEFAULTS,
};

const STORAGE_KEY = 'kanbots:prefs';
const STORAGE_VERSION = 1;

// Legacy keys — read once on first migration, then ignored. We deliberately
// don't delete them so a downgrade leaves the user's prefs intact for one
// release cycle.
const LEGACY_KEYS = {
  diffPrefs: 'kanbots:diff-prefs',
  focusedRepo: 'kanbots:focused-repo',
  tweaks: 'kanbots:tweaks',
  boardSortMode: 'kanbots:board:sortMode',
  boardIncludeBacklog: 'kanbots:board:includeBacklog',
  boardViewsPrefix: 'kanbots:board-views:',
  boardViewsSeedPrefix: 'kanbots:board-views-seeded:',
} as const;

function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readLegacyDiffPrefs(): DiffPrefs {
  const raw = safeGetItem(LEGACY_KEYS.diffPrefs);
  if (raw === null) return DIFF_PREFS_DEFAULTS;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return DIFF_PREFS_DEFAULTS;
    return {
      mode:
        parsed.mode === 'split' || parsed.mode === 'unified'
          ? parsed.mode
          : DIFF_PREFS_DEFAULTS.mode,
      ignoreWhitespace:
        typeof parsed.ignoreWhitespace === 'boolean'
          ? parsed.ignoreWhitespace
          : DIFF_PREFS_DEFAULTS.ignoreWhitespace,
    };
  } catch {
    return DIFF_PREFS_DEFAULTS;
  }
}

function readLegacyFocusedRepo(): number | null {
  const raw = safeGetItem(LEGACY_KEYS.focusedRepo);
  if (raw === null) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readLegacyTweaks(): Tweaks {
  const raw = safeGetItem(LEGACY_KEYS.tweaks);
  if (raw === null) return TWEAK_DEFAULTS;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return TWEAK_DEFAULTS;
    return {
      theme:
        parsed.theme === 'paper' || parsed.theme === 'dark'
          ? parsed.theme
          : TWEAK_DEFAULTS.theme,
      accentHue:
        typeof parsed.accentHue === 'number'
          ? parsed.accentHue
          : TWEAK_DEFAULTS.accentHue,
      showRail:
        typeof parsed.showRail === 'boolean'
          ? parsed.showRail
          : TWEAK_DEFAULTS.showRail,
      showTray:
        typeof parsed.showTray === 'boolean'
          ? parsed.showTray
          : TWEAK_DEFAULTS.showTray,
    };
  } catch {
    return TWEAK_DEFAULTS;
  }
}

const SORT_MODES: readonly BoardSortMode[] = [
  'manual',
  'priority',
  'createdAt',
  'updatedAt',
];

function readLegacyBoardPrefs(): BoardPrefs {
  const rawSort = safeGetItem(LEGACY_KEYS.boardSortMode);
  const sortMode: BoardSortMode =
    rawSort !== null && (SORT_MODES as readonly string[]).includes(rawSort)
      ? (rawSort as BoardSortMode)
      : BOARD_PREFS_DEFAULTS.sortMode;
  const rawIncl = safeGetItem(LEGACY_KEYS.boardIncludeBacklog);
  const includeBacklog = rawIncl === '1';
  return { sortMode, includeBacklog };
}

function isBoardView(v: unknown): v is BoardView {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.createdAt === 'string' &&
    typeof v.sortMode === 'string' &&
    typeof v.includeBacklog === 'boolean' &&
    isRecord(v.filters) &&
    typeof v.filters.hasAgent === 'boolean' &&
    Array.isArray(v.filters.priorities) &&
    Array.isArray(v.filters.areas)
  );
}

function readLegacyBoardViews(): Record<string, WorkspaceBoardViews> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, WorkspaceBoardViews> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key === null) continue;
      if (!key.startsWith(LEGACY_KEYS.boardViewsPrefix)) continue;
      const workspaceId = key.slice(LEGACY_KEYS.boardViewsPrefix.length);
      if (workspaceId.length === 0) continue;
      const raw = safeGetItem(key);
      if (raw === null) continue;
      try {
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed)) continue;
        const views = Array.isArray(parsed.views)
          ? parsed.views.filter(isBoardView)
          : [];
        const activeViewId =
          typeof parsed.activeViewId === 'string' &&
          views.some((view) => view.id === parsed.activeViewId)
            ? parsed.activeViewId
            : null;
        const seeded =
          safeGetItem(`${LEGACY_KEYS.boardViewsSeedPrefix}${workspaceId}`) === '1';
        out[workspaceId] = { views, activeViewId, seeded };
      } catch {
        // skip malformed entry
      }
    }
  } catch {
    // localStorage iteration can throw in some Electron edge cases; bail
    // gracefully with whatever we've already collected.
  }
  return out;
}

function readLegacyState(): PrefsState {
  return {
    diff: readLegacyDiffPrefs(),
    focusedRepoId: readLegacyFocusedRepo(),
    boardViews: readLegacyBoardViews(),
    tweaks: readLegacyTweaks(),
    board: readLegacyBoardPrefs(),
  };
}

// Custom storage adapter so the persist middleware tolerates private-mode /
// quota errors the same way the legacy hooks did. Without this, a thrown
// setItem leaves the in-memory store and on-disk store out of sync.
const safeJSONStorage: PersistStorage<PrefsState> = {
  getItem: (name) => {
    const raw = safeGetItem(name);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as StorageValue<PrefsState>;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // ignore — private mode / quota
    }
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

export const usePrefsStore = create<PrefsState & PrefsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setDiffMode: (mode) => set((s) => ({ diff: { ...s.diff, mode } })),
      setDiffIgnoreWhitespace: (value) =>
        set((s) => ({ diff: { ...s.diff, ignoreWhitespace: value } })),
      setDiffPref: (key, value) =>
        set((s) => ({ diff: { ...s.diff, [key]: value } })),

      setFocusedRepoId: (id) => set({ focusedRepoId: id }),

      setTweak: (key, value) =>
        set((s) => ({ tweaks: { ...s.tweaks, [key]: value } })),
      resetTweaks: () => set({ tweaks: TWEAK_DEFAULTS }),

      setBoardSortMode: (mode) =>
        set((s) => ({ board: { ...s.board, sortMode: mode } })),
      setBoardIncludeBacklog: (value) =>
        set((s) => ({ board: { ...s.board, includeBacklog: value } })),

      setWorkspaceBoardViews: (workspaceId, store) =>
        set((s) => ({ boardViews: { ...s.boardViews, [workspaceId]: store } })),

      setActiveBoardView: (workspaceId, id) =>
        set((s) => {
          const ws =
            s.boardViews[workspaceId] ?? { views: [], activeViewId: null, seeded: false };
          if (id !== null && !ws.views.some((v) => v.id === id)) return s;
          if (ws.activeViewId === id) return s;
          return {
            boardViews: {
              ...s.boardViews,
              [workspaceId]: { ...ws, activeViewId: id },
            },
          };
        }),

      upsertBoardView: (workspaceId, view) =>
        set((s) => {
          const ws =
            s.boardViews[workspaceId] ?? { views: [], activeViewId: null, seeded: false };
          const idx = ws.views.findIndex((v) => v.id === view.id);
          const views = idx === -1
            ? [...ws.views, view]
            : ws.views.map((v) => (v.id === view.id ? view : v));
          return {
            boardViews: {
              ...s.boardViews,
              [workspaceId]: { ...ws, views, activeViewId: view.id },
            },
          };
        }),

      patchBoardView: (workspaceId, id, patch) =>
        set((s) => {
          const ws = s.boardViews[workspaceId];
          if (!ws) return s;
          return {
            boardViews: {
              ...s.boardViews,
              [workspaceId]: {
                ...ws,
                views: ws.views.map((v) => (v.id === id ? { ...v, ...patch } : v)),
              },
            },
          };
        }),

      deleteBoardView: (workspaceId, id) =>
        set((s) => {
          const ws = s.boardViews[workspaceId];
          if (!ws) return s;
          return {
            boardViews: {
              ...s.boardViews,
              [workspaceId]: {
                ...ws,
                views: ws.views.filter((v) => v.id !== id),
                activeViewId: ws.activeViewId === id ? null : ws.activeViewId,
              },
            },
          };
        }),

      reorderBoardViews: (workspaceId, ids) =>
        set((s) => {
          const ws = s.boardViews[workspaceId];
          if (!ws) return s;
          const byId = new Map(ws.views.map((v) => [v.id, v] as const));
          const next: BoardView[] = [];
          for (const id of ids) {
            const v = byId.get(id);
            if (v) {
              next.push(v);
              byId.delete(id);
            }
          }
          for (const v of byId.values()) next.push(v);
          return {
            boardViews: {
              ...s.boardViews,
              [workspaceId]: { ...ws, views: next },
            },
          };
        }),

      markWorkspaceSeeded: (workspaceId) =>
        set((s) => {
          const ws =
            s.boardViews[workspaceId] ?? { views: [], activeViewId: null, seeded: false };
          if (ws.seeded) return s;
          return {
            boardViews: {
              ...s.boardViews,
              [workspaceId]: { ...ws, seeded: true },
            },
          };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: safeJSONStorage,
      // On first load (or if the persisted version is older), seed from any
      // legacy keys present. Returning the merged state means subsequent
      // edits live in `kanbots:prefs` only.
      migrate: (persisted, fromVersion) => {
        const legacy = readLegacyState();
        if (!isRecord(persisted) || fromVersion < STORAGE_VERSION) {
          // No persisted state, or older schema — start from legacy + defaults.
          return { ...DEFAULT_STATE, ...legacy };
        }
        // Future-proof: when we bump versions, fall through to here and
        // merge per-slice. For v1 we just return the persisted state.
        return persisted as unknown as PrefsState;
      },
      // Merge so newly-added fields fall back to defaults rather than being
      // left undefined when an older blob is rehydrated.
      merge: (persisted, current) => {
        if (!isRecord(persisted)) return current;
        const p = persisted as Partial<PrefsState>;
        return {
          ...current,
          ...p,
          diff: { ...current.diff, ...(p.diff ?? {}) },
          tweaks: { ...current.tweaks, ...(p.tweaks ?? {}) },
          board: { ...current.board, ...(p.board ?? {}) },
          boardViews: { ...current.boardViews, ...(p.boardViews ?? {}) },
        };
      },
    },
  ),
);

// One-shot legacy import for users whose first load happens AFTER the store
// already exists (e.g. they reloaded once before this migration shipped, so
// `persist`'s migrate step won't fire — it only runs when version changes).
// Idempotent: only seeds slices that are still at their default values and
// for which a legacy key exists. Safe to leave forever.
function hydrateFromLegacyIfDefault(): void {
  if (typeof window === 'undefined') return;
  const state = usePrefsStore.getState();
  const patch: Partial<PrefsState> = {};

  if (
    state.diff.mode === DIFF_PREFS_DEFAULTS.mode &&
    state.diff.ignoreWhitespace === DIFF_PREFS_DEFAULTS.ignoreWhitespace &&
    safeGetItem(LEGACY_KEYS.diffPrefs) !== null
  ) {
    patch.diff = readLegacyDiffPrefs();
  }
  if (state.focusedRepoId === null && safeGetItem(LEGACY_KEYS.focusedRepo) !== null) {
    patch.focusedRepoId = readLegacyFocusedRepo();
  }
  if (
    state.tweaks.theme === TWEAK_DEFAULTS.theme &&
    state.tweaks.accentHue === TWEAK_DEFAULTS.accentHue &&
    state.tweaks.showRail === TWEAK_DEFAULTS.showRail &&
    state.tweaks.showTray === TWEAK_DEFAULTS.showTray &&
    safeGetItem(LEGACY_KEYS.tweaks) !== null
  ) {
    patch.tweaks = readLegacyTweaks();
  }
  if (
    state.board.sortMode === BOARD_PREFS_DEFAULTS.sortMode &&
    state.board.includeBacklog === BOARD_PREFS_DEFAULTS.includeBacklog &&
    (safeGetItem(LEGACY_KEYS.boardSortMode) !== null ||
      safeGetItem(LEGACY_KEYS.boardIncludeBacklog) !== null)
  ) {
    patch.board = readLegacyBoardPrefs();
  }
  if (Object.keys(state.boardViews).length === 0) {
    const legacy = readLegacyBoardViews();
    if (Object.keys(legacy).length > 0) patch.boardViews = legacy;
  }

  if (Object.keys(patch).length > 0) {
    usePrefsStore.setState(patch);
  }
}

// Fire once at module load. The store has already been rehydrated by
// `persist` synchronously when this module is imported in the browser, so
// the check above sees the final post-rehydration state.
hydrateFromLegacyIfDefault();

// ---------------------------------------------------------------------------
// Selector hooks — encourage scoped subscriptions. Components that only care
// about one slice import the matching selector and don't re-render on
// unrelated edits.

export const useDiffPrefs_select = () => usePrefsStore((s) => s.diff);
export const useDiffMode = () => usePrefsStore((s) => s.diff.mode);
export const useDiffIgnoreWhitespace = () =>
  usePrefsStore((s) => s.diff.ignoreWhitespace);

export const useFocusedRepoId = () => usePrefsStore((s) => s.focusedRepoId);

export const useTweaksState = () => usePrefsStore((s) => s.tweaks);

export const useBoardPrefs = () => usePrefsStore((s) => s.board);
export const useBoardSortMode = () => usePrefsStore((s) => s.board.sortMode);
export const useBoardIncludeBacklog = () =>
  usePrefsStore((s) => s.board.includeBacklog);

export const useWorkspaceBoardViews = (
  workspaceId: string | null,
): WorkspaceBoardViews | null =>
  usePrefsStore((s) =>
    workspaceId === null ? null : (s.boardViews[workspaceId] ?? null),
  );
