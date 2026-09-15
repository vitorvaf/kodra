import { beforeEach, describe, expect, it } from 'vitest';
import {
  BOARD_PREFS_DEFAULTS,
  DIFF_PREFS_DEFAULTS,
  TWEAK_DEFAULTS,
  usePrefsStore,
  type BoardView,
} from './usePrefsStore.js';

const WS = 'workspace-1';

function view(id: string, name = id): BoardView {
  return {
    id,
    name,
    createdAt: '2026-09-14T00:00:00Z',
    filters: { hasAgent: false, priorities: [], areas: [] },
    sortMode: 'manual',
    includeBacklog: false,
  };
}

beforeEach(() => {
  usePrefsStore.setState({
    diff: DIFF_PREFS_DEFAULTS,
    focusedRepoId: null,
    currentFolderId: null,
    boardViews: {},
    tweaks: TWEAK_DEFAULTS,
    board: BOARD_PREFS_DEFAULTS,
  });
});

describe('simple slices', () => {
  it('updates diff prefs without clobbering sibling fields', () => {
    const s = usePrefsStore.getState();
    s.setDiffMode('split');
    s.setDiffIgnoreWhitespace(false);
    expect(usePrefsStore.getState().diff).toEqual({ mode: 'split', ignoreWhitespace: false });
    s.setDiffPref('mode', 'unified');
    expect(usePrefsStore.getState().diff).toEqual({ mode: 'unified', ignoreWhitespace: false });
  });

  it('sets and resets tweaks', () => {
    const s = usePrefsStore.getState();
    s.setTweak('theme', 'paper');
    s.setTweak('accentHue', 120);
    expect(usePrefsStore.getState().tweaks).toEqual({
      ...TWEAK_DEFAULTS,
      theme: 'paper',
      accentHue: 120,
    });
    s.resetTweaks();
    expect(usePrefsStore.getState().tweaks).toEqual(TWEAK_DEFAULTS);
  });

  it('updates board prefs and focus ids', () => {
    const s = usePrefsStore.getState();
    s.setBoardSortMode('priority');
    s.setBoardIncludeBacklog(true);
    s.setFocusedRepoId(7);
    s.setCurrentFolderId('f1');
    const next = usePrefsStore.getState();
    expect(next.board).toEqual({ sortMode: 'priority', includeBacklog: true });
    expect(next.focusedRepoId).toBe(7);
    expect(next.currentFolderId).toBe('f1');
  });
});

describe('board views', () => {
  it('upsert adds a view, activates it, and replaces on the same id', () => {
    const s = usePrefsStore.getState();
    s.upsertBoardView(WS, view('a'));
    s.upsertBoardView(WS, view('b'));
    s.upsertBoardView(WS, view('a', 'renamed'));
    const ws = usePrefsStore.getState().boardViews[WS]!;
    expect(ws.views.map((v) => `${v.id}:${v.name}`)).toEqual(['a:renamed', 'b:b']);
    expect(ws.activeViewId).toBe('a');
    expect(ws.seeded).toBe(false);
  });

  it('setActiveBoardView ignores unknown ids and keeps state identity when unchanged', () => {
    const s = usePrefsStore.getState();
    s.upsertBoardView(WS, view('a'));
    const before = usePrefsStore.getState();
    s.setActiveBoardView(WS, 'missing');
    expect(usePrefsStore.getState()).toBe(before);
    s.setActiveBoardView(WS, 'a');
    expect(usePrefsStore.getState()).toBe(before);
    s.setActiveBoardView(WS, null);
    expect(usePrefsStore.getState().boardViews[WS]!.activeViewId).toBeNull();
  });

  it('patch and delete only touch the targeted view and clear the active id on delete', () => {
    const s = usePrefsStore.getState();
    s.upsertBoardView(WS, view('a'));
    s.upsertBoardView(WS, view('b'));
    s.patchBoardView(WS, 'a', { name: 'A!', includeBacklog: true });
    let ws = usePrefsStore.getState().boardViews[WS]!;
    expect(ws.views[0]).toMatchObject({ id: 'a', name: 'A!', includeBacklog: true });
    expect(ws.views[1]).toEqual(view('b'));

    s.deleteBoardView(WS, 'b');
    ws = usePrefsStore.getState().boardViews[WS]!;
    expect(ws.views.map((v) => v.id)).toEqual(['a']);
    expect(ws.activeViewId).toBeNull();
  });

  it('patch and delete are no-ops for unknown workspaces', () => {
    const s = usePrefsStore.getState();
    const before = usePrefsStore.getState();
    s.patchBoardView('nope', 'a', { name: 'x' });
    s.deleteBoardView('nope', 'a');
    expect(usePrefsStore.getState()).toBe(before);
  });

  it('reorder follows the given ids and appends any it did not mention', () => {
    const s = usePrefsStore.getState();
    for (const id of ['a', 'b', 'c']) s.upsertBoardView(WS, view(id));
    s.reorderBoardViews(WS, ['c', 'a', 'ghost']);
    expect(usePrefsStore.getState().boardViews[WS]!.views.map((v) => v.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('markWorkspaceSeeded creates the workspace entry and is idempotent', () => {
    const s = usePrefsStore.getState();
    s.markWorkspaceSeeded(WS);
    const once = usePrefsStore.getState();
    expect(once.boardViews[WS]).toEqual({ views: [], activeViewId: null, seeded: true });
    s.markWorkspaceSeeded(WS);
    expect(usePrefsStore.getState()).toBe(once);
  });
});
