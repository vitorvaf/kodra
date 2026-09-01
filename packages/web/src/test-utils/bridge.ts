import type {
  ChannelArgs,
  ChannelName,
  ChannelResult,
  KanbotsBridge,
} from '../global.js';

type Handlers = {
  [C in ChannelName]?: (args: ChannelArgs<C>) => Promise<ChannelResult<C>>;
};

interface FakeBridgeExtras {
  // Test-only: drive subscribe listeners as if the main process
  // pushed an event. Production code must not call this.
  push(eventName: string, payload: unknown): void;
}

export type FakeBridge = KanbotsBridge & FakeBridgeExtras;

interface InstallOptions {
  handlers?: Handlers;
  // Optional partial lifecycle overrides; useful for tests that exercise
  // bootstrap-time flows without standing up the full main process.
  lifecycle?: Partial<KanbotsBridge>;
}

/**
 * Installs a fake `window.kanbots` driven by in-memory handlers.
 *
 * Used by:
 *   - component tests that need a deterministic bridge,
 *   - dev mode while pivot/02-bridge is in flight (renderer falls
 *     back to this if the real bridge is missing).
 *
 * Returns the installed bridge so the caller can drive subscribe
 * listeners via `bridge.push('agent-runs:events:data', payload)`.
 */
export function installFakeBridge(opts: InstallOptions = {}): FakeBridge {
  const handlers: Handlers = opts.handlers ?? {};
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  const lifecycleDefaults: Pick<
    KanbotsBridge,
    | 'bootstrap'
    | 'pickFolder'
    | 'openWorkspace'
    | 'closeWorkspace'
    | 'recentWorkspaces'
    | 'minimizeWindow'
    | 'toggleMaximizeWindow'
    | 'closeWindow'
    | 'claudeAuthStatus'
    | 'claudeLoginStart'
    | 'claudeLoginCancel'
    | 'codexAuthStatus'
    | 'codexLoginStart'
    | 'codexLoginCancel'
    | 'geminiAuthStatus'
    | 'geminiLoginStart'
    | 'geminiLoginCancel'
    | 'ampAuthStatus'
    | 'ampLoginStart'
    | 'ampLoginCancel'
    | 'cursorAuthStatus'
    | 'cursorLoginStart'
    | 'cursorLoginCancel'
    | 'copilotAuthStatus'
    | 'copilotLoginStart'
    | 'copilotLoginCancel'
    | 'opencodeAuthStatus'
    | 'opencodeLoginStart'
    | 'opencodeLoginCancel'
    | 'droidAuthStatus'
    | 'droidLoginStart'
    | 'droidLoginCancel'
    | 'ccrAuthStatus'
    | 'ccrLoginStart'
    | 'ccrLoginCancel'
    | 'qwenAuthStatus'
    | 'qwenLoginStart'
    | 'qwenLoginCancel'
    | 'cloudAuthStatus'
    | 'cloudLoginStart'
    | 'cloudLoginPoll'
    | 'cloudLoginCancel'
    | 'cloudLogout'
    | 'cloudPromptDismiss'
    | 'cloudUsersMe'
    | 'cloudOrgsList'
    | 'cloudOrgsCreate'
    | 'cloudProjectsList'
    | 'cloudProjectsCreate'
    | 'cloudCardsList'
    | 'cloudCardsCreate'
    | 'cloudCardsGet'
    | 'cloudCardsUpdate'
    | 'cloudCardsArchive'
    | 'cloudCardsUnarchive'
    | 'cloudCommentsList'
    | 'cloudCommentsAdd'
    | 'cloudAttachmentsList'
    | 'cloudRunsListForCard'
    | 'cloudRunsCreate'
    | 'cloudStartAgentRun'
    | 'workspaceCurrentRoot'
    | 'workspaceReadDir'
    | 'workspaceWorktreeStatus'
    | 'workspaceSubscribeTouched'
    | 'workspaceListWorktrees'
    | 'workspaceRevealPath'
    | 'workspaceCopyPath'
    | 'workspaceRemoveWorktree'
    | 'workspaceFileDiff'
    | 'workspaceFileRead'
    | 'cloudRunsGet'
    | 'cloudRunsStreamStart'
    | 'cloudRunsStreamStop'
    | 'cloudCostToday'
    | 'openCloudWorkspace'
    | 'closeCloudWorkspace'
    | 'recentCloudWorkspaces'
    | 'cloudProjectBindingGet'
    | 'cloudProjectBindingSet'
    | 'cloudProjectBindingClear'
    | 'setNotifyOnRunComplete'
  > = {
    bootstrap: () =>
      Promise.resolve({
        workspace: null,
        cloudWorkspace: null,
        recents: [],
        cloudRecents: [],
        claudeAuthed: true,
        codexAuthed: true,
        geminiAuthed: true,
        ampAuthed: true,
        cursorAuthed: true,
        copilotAuthed: true,
        opencodeAuthed: true,
        droidAuthed: true,
        ccrAuthed: true,
        qwenAuthed: true,
        cloudAuthed: false,
        cloudPromptDismissed: true,
      }),
    pickFolder: () => Promise.resolve(null),
    openWorkspace: () => Promise.resolve({ ok: true }),
    closeWorkspace: () => Promise.resolve(),
    recentWorkspaces: () => Promise.resolve([]),
    minimizeWindow: () => Promise.resolve(),
    toggleMaximizeWindow: () => Promise.resolve(),
    closeWindow: () => Promise.resolve(),
    claudeAuthStatus: () => Promise.resolve({ authed: true }),
    claudeLoginStart: () => Promise.resolve({ ok: true }),
    claudeLoginCancel: () => Promise.resolve(),
    codexAuthStatus: () => Promise.resolve({ authed: true }),
    codexLoginStart: () => Promise.resolve({ ok: true }),
    codexLoginCancel: () => Promise.resolve(),
    geminiAuthStatus: () => Promise.resolve({ authed: true }),
    geminiLoginStart: () => Promise.resolve({ ok: true }),
    geminiLoginCancel: () => Promise.resolve(),
    ampAuthStatus: () => Promise.resolve({ authed: true }),
    ampLoginStart: () => Promise.resolve({ ok: true }),
    ampLoginCancel: () => Promise.resolve(),
    cursorAuthStatus: () => Promise.resolve({ authed: true }),
    cursorLoginStart: () => Promise.resolve({ ok: true }),
    cursorLoginCancel: () => Promise.resolve(),
    copilotAuthStatus: () => Promise.resolve({ authed: true }),
    copilotLoginStart: () => Promise.resolve({ ok: true }),
    copilotLoginCancel: () => Promise.resolve(),
    opencodeAuthStatus: () => Promise.resolve({ authed: true }),
    opencodeLoginStart: () => Promise.resolve({ ok: true }),
    opencodeLoginCancel: () => Promise.resolve(),
    droidAuthStatus: () => Promise.resolve({ authed: true }),
    droidLoginStart: () => Promise.resolve({ ok: true }),
    droidLoginCancel: () => Promise.resolve(),
    ccrAuthStatus: () => Promise.resolve({ authed: true }),
    ccrLoginStart: () => Promise.resolve({ ok: true }),
    ccrLoginCancel: () => Promise.resolve(),
    qwenAuthStatus: () => Promise.resolve({ authed: true }),
    qwenLoginStart: () => Promise.resolve({ ok: true }),
    qwenLoginCancel: () => Promise.resolve(),
    cloudAuthStatus: () =>
      Promise.resolve({
        authed: false,
        baseUrl: null,
        tokenPrefix: null,
        orgId: null,
        signedInAt: null,
        promptDismissed: true,
      }),
    cloudLoginStart: () => Promise.resolve({ ok: false, error: 'fake bridge: no cloud' }),
    cloudLoginPoll: () => Promise.resolve({ status: 'idle' }),
    cloudLoginCancel: () => Promise.resolve(),
    cloudLogout: () => Promise.resolve(),
    cloudPromptDismiss: () => Promise.resolve(),
    cloudUsersMe: () => Promise.reject(new Error('fake bridge: no cloud user')),
    cloudOrgsList: () => Promise.resolve({ data: [], next_cursor: null }),
    cloudOrgsCreate: () => Promise.reject(new Error('fake bridge: no cloud orgs')),
    cloudProjectsList: () => Promise.resolve({ data: [] }),
    cloudProjectsCreate: () => Promise.reject(new Error('fake bridge: no cloud projects')),
    cloudCardsList: () => Promise.resolve({ data: [], next_cursor: null }),
    cloudCardsCreate: () => Promise.reject(new Error('fake bridge: no cloud cards')),
    cloudCardsGet: () => Promise.reject(new Error('fake bridge: no cloud cards')),
    cloudCardsUpdate: () => Promise.reject(new Error('fake bridge: no cloud cards')),
    cloudCardsArchive: () => Promise.reject(new Error('fake bridge: no cloud cards')),
    cloudCardsUnarchive: () => Promise.reject(new Error('fake bridge: no cloud cards')),
    cloudCommentsList: () => Promise.resolve({ data: [], next_cursor: null }),
    cloudCommentsAdd: () => Promise.reject(new Error('fake bridge: no cloud comments')),
    cloudAttachmentsList: () => Promise.resolve({ data: [] }),
    cloudRunsListForCard: () => Promise.resolve({ data: [], next_cursor: null }),
    cloudRunsCreate: () => Promise.reject(new Error('fake bridge: no cloud runs')),
    cloudStartAgentRun: () => Promise.reject(new Error('fake bridge: no cloud runs')),
    workspaceCurrentRoot: () => Promise.resolve({ repoRoot: null }),
    workspaceReadDir: () => Promise.resolve([]),
    workspaceWorktreeStatus: () => Promise.resolve({ files: {}, worktrees: [] }),
    workspaceSubscribeTouched: () => () => {},
    workspaceListWorktrees: () => Promise.resolve([]),
    workspaceRevealPath: () => Promise.resolve({ ok: true }),
    workspaceCopyPath: () => Promise.resolve({ ok: true }),
    workspaceRemoveWorktree: () => Promise.resolve({ ok: true }),
    workspaceFileDiff: () => Promise.resolve({ status: null, oldText: null, newText: null }),
    workspaceFileRead: () =>
      Promise.resolve({
        content: null,
        size: 0,
        truncated: false,
        isBinary: false,
        error: 'fake bridge: no file read',
      }),
    cloudRunsGet: () => Promise.reject(new Error('fake bridge: no cloud runs')),
    cloudRunsStreamStart: () => Promise.resolve({ subscriptionId: 'fake' }),
    cloudRunsStreamStop: () => Promise.resolve(),
    cloudCostToday: () =>
      Promise.resolve({ totalUsd: 0, since: new Date().toISOString() }),
    cloudProjectBindingGet: () => Promise.resolve(null),
    cloudProjectBindingSet: () =>
      Promise.resolve({ localRepoPath: '/tmp', updatedAt: new Date().toISOString() }),
    cloudProjectBindingClear: () => Promise.resolve(),
    openCloudWorkspace: () => Promise.resolve({ ok: true }),
    closeCloudWorkspace: () => Promise.resolve(),
    recentCloudWorkspaces: () => Promise.resolve([]),
    setNotifyOnRunComplete: () => Promise.resolve({ ok: true }),
  };

  const bridge: FakeBridge = {
    ...lifecycleDefaults,
    ...opts.lifecycle,
    invoke: <C extends ChannelName>(
      channel: C,
      args: ChannelArgs<C>,
    ): Promise<ChannelResult<C>> => {
      const fn = handlers[channel];
      if (!fn) {
        return Promise.reject(new Error(`fake bridge: no handler for ${channel}`));
      }
      return fn(args);
    },
    subscribe: (eventName, listener) => {
      const set = listeners.get(eventName) ?? new Set();
      set.add(listener);
      listeners.set(eventName, set);
      return () => {
        set.delete(listener);
      };
    },
    push: (eventName, payload) => {
      const set = listeners.get(eventName);
      if (!set) return;
      for (const listener of set) listener(payload);
    },
  };

  if (typeof window === 'undefined') {
    // jsdom-less environments (e.g. node-only tests) — synthesize a
    // window stub so renderer code can read window.kanbots.
    (globalThis as { window?: Window }).window = globalThis as unknown as Window;
  }
  (window as { kanbots?: KanbotsBridge }).kanbots = bridge;

  return bridge;
}

/**
 * Removes the fake bridge from window. Useful between tests.
 */
export function uninstallFakeBridge(): void {
  if (typeof window === 'undefined') return;
  delete (window as { kanbots?: KanbotsBridge }).kanbots;
}
