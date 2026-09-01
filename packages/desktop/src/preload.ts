import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ChannelArgs, ChannelName, ChannelResult } from '@kanbots/api';
import type {
  AgentRunListResponse,
  AgentRunSummary,
  AttachmentListResponse,
  CardListResponse,
  CardSummary,
  CommentListResponse,
  CommentSummary,
  CreateAgentRunRequest,
  CreateCardRequest,
  CreateOrgRequest,
  CreateOrgResponse,
  CreateProjectRequest,
  ListCardsQuery,
  OrgListResponse,
  ProjectListResponse,
  ProjectSummary,
  UpdateCardRequest,
  UserMe,
} from '@kanbots/cloud-client';
import type {
  BootstrapPayload,
  CloudLoginPollResult,
  CloudLoginStartResult,
  CloudStatusPayload,
  KanbotsBridge,
  RecentCloudWorkspace,
  RecentWorkspace,
} from './types.js';

const INVOKE_PREFIX = 'kanbots:invoke:';

const api: KanbotsBridge = {
  bootstrap: () => ipcRenderer.invoke('kanbots:bootstrap') as Promise<BootstrapPayload>,
  pickFolder: () => ipcRenderer.invoke('kanbots:pick-folder') as Promise<string | null>,
  openWorkspace: (repoPath: string) =>
    ipcRenderer.invoke('kanbots:open-workspace', repoPath) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  closeWorkspace: () => ipcRenderer.invoke('kanbots:close-workspace') as Promise<void>,
  recentWorkspaces: () =>
    ipcRenderer.invoke('kanbots:recent-workspaces') as Promise<RecentWorkspace[]>,
  minimizeWindow: () => ipcRenderer.invoke('kanbots:window-minimize') as Promise<void>,
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke('kanbots:window-toggle-maximize') as Promise<void>,
  closeWindow: () => ipcRenderer.invoke('kanbots:window-close') as Promise<void>,
  claudeAuthStatus: () =>
    ipcRenderer.invoke('kanbots:claude-auth-status') as Promise<{ authed: boolean }>,
  claudeLoginStart: () =>
    ipcRenderer.invoke('kanbots:claude-login-start') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  claudeLoginCancel: () => ipcRenderer.invoke('kanbots:claude-login-cancel') as Promise<void>,
  codexAuthStatus: () =>
    ipcRenderer.invoke('kanbots:codex-auth-status') as Promise<{ authed: boolean }>,
  codexLoginStart: () =>
    ipcRenderer.invoke('kanbots:codex-login-start') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  codexLoginCancel: () => ipcRenderer.invoke('kanbots:codex-login-cancel') as Promise<void>,
  geminiAuthStatus: () =>
    ipcRenderer.invoke('kanbots:gemini-auth-status') as Promise<{ authed: boolean }>,
  geminiLoginStart: () =>
    ipcRenderer.invoke('kanbots:gemini-login-start') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  geminiLoginCancel: () => ipcRenderer.invoke('kanbots:gemini-login-cancel') as Promise<void>,
  ampAuthStatus: () =>
    ipcRenderer.invoke('kanbots:amp-auth-status') as Promise<{ authed: boolean }>,
  ampLoginStart: () =>
    ipcRenderer.invoke('kanbots:amp-login-start') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  ampLoginCancel: () => ipcRenderer.invoke('kanbots:amp-login-cancel') as Promise<void>,
  cursorAuthStatus: () =>
    ipcRenderer.invoke('kanbots:cursor-auth-status') as Promise<{ authed: boolean }>,
  cursorLoginStart: () =>
    ipcRenderer.invoke('kanbots:cursor-login-start') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  cursorLoginCancel: () => ipcRenderer.invoke('kanbots:cursor-login-cancel') as Promise<void>,
  copilotAuthStatus: () =>
    ipcRenderer.invoke('kanbots:copilot-auth-status') as Promise<{ authed: boolean }>,
  copilotLoginStart: () =>
    ipcRenderer.invoke('kanbots:copilot-login-start') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  copilotLoginCancel: () => ipcRenderer.invoke('kanbots:copilot-login-cancel') as Promise<void>,
  opencodeAuthStatus: () =>
    ipcRenderer.invoke('kanbots:opencode-auth-status') as Promise<{ authed: boolean }>,
  opencodeLoginStart: () =>
    ipcRenderer.invoke('kanbots:opencode-login-start') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  opencodeLoginCancel: () => ipcRenderer.invoke('kanbots:opencode-login-cancel') as Promise<void>,
  droidAuthStatus: () =>
    ipcRenderer.invoke('kanbots:droid-auth-status') as Promise<{ authed: boolean }>,
  droidLoginStart: () =>
    ipcRenderer.invoke('kanbots:droid-login-start') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  droidLoginCancel: () => ipcRenderer.invoke('kanbots:droid-login-cancel') as Promise<void>,
  ccrAuthStatus: () =>
    ipcRenderer.invoke('kanbots:ccr-auth-status') as Promise<{ authed: boolean }>,
  ccrLoginStart: () =>
    ipcRenderer.invoke('kanbots:ccr-login-start') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  ccrLoginCancel: () => ipcRenderer.invoke('kanbots:ccr-login-cancel') as Promise<void>,
  qwenAuthStatus: () =>
    ipcRenderer.invoke('kanbots:qwen-auth-status') as Promise<{ authed: boolean }>,
  qwenLoginStart: () =>
    ipcRenderer.invoke('kanbots:qwen-login-start') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  qwenLoginCancel: () => ipcRenderer.invoke('kanbots:qwen-login-cancel') as Promise<void>,
  cloudAuthStatus: () =>
    ipcRenderer.invoke('kanbots:cloud-auth-status') as Promise<CloudStatusPayload>,
  cloudLoginStart: (opts?: { baseUrl?: string }) =>
    ipcRenderer.invoke('kanbots:cloud-login-start', opts) as Promise<CloudLoginStartResult>,
  cloudLoginPoll: () =>
    ipcRenderer.invoke('kanbots:cloud-login-poll') as Promise<CloudLoginPollResult>,
  cloudLoginCancel: () => ipcRenderer.invoke('kanbots:cloud-login-cancel') as Promise<void>,
  cloudLogout: () => ipcRenderer.invoke('kanbots:cloud-logout') as Promise<void>,
  cloudPromptDismiss: () => ipcRenderer.invoke('kanbots:cloud-prompt-dismiss') as Promise<void>,
  cloudUsersMe: () => ipcRenderer.invoke('kanbots:cloud:users-me') as Promise<UserMe>,
  cloudOrgsList: (opts?: { cursor?: string; limit?: number }) =>
    ipcRenderer.invoke('kanbots:cloud:orgs-list', opts) as Promise<OrgListResponse>,
  cloudOrgsCreate: (body: CreateOrgRequest) =>
    ipcRenderer.invoke('kanbots:cloud:orgs-create', body) as Promise<CreateOrgResponse>,
  cloudProjectsList: (orgSlug: string) =>
    ipcRenderer.invoke('kanbots:cloud:projects-list', orgSlug) as Promise<ProjectListResponse>,
  cloudProjectsCreate: (args: { orgSlug: string; body: CreateProjectRequest }) =>
    ipcRenderer.invoke('kanbots:cloud:projects-create', args) as Promise<ProjectSummary>,
  cloudCardsList: (args: {
    orgSlug: string;
    projectSlug: string;
    query?: ListCardsQuery;
  }) => ipcRenderer.invoke('kanbots:cloud:cards-list', args) as Promise<CardListResponse>,
  cloudCardsCreate: (args: {
    orgSlug: string;
    projectSlug: string;
    body: CreateCardRequest;
  }) => ipcRenderer.invoke('kanbots:cloud:cards-create', args) as Promise<CardSummary>,
  cloudCardsGet: (args: { orgSlug: string; projectSlug: string; number: number }) =>
    ipcRenderer.invoke('kanbots:cloud:cards-get', args) as Promise<CardSummary>,
  cloudCardsUpdate: (args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
    body: UpdateCardRequest;
    ifMatch?: string;
  }) => ipcRenderer.invoke('kanbots:cloud:cards-update', args) as Promise<CardSummary>,
  cloudCardsArchive: (args: { orgSlug: string; projectSlug: string; number: number }) =>
    ipcRenderer.invoke('kanbots:cloud:cards-archive', args) as Promise<void>,
  cloudCardsUnarchive: (args: { orgSlug: string; projectSlug: string; number: number }) =>
    ipcRenderer.invoke('kanbots:cloud:cards-unarchive', args) as Promise<CardSummary>,
  cloudCommentsList: (args: { orgSlug: string; projectSlug: string; number: number }) =>
    ipcRenderer.invoke('kanbots:cloud:comments-list', args) as Promise<CommentListResponse>,
  cloudCommentsAdd: (args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
    body: string;
  }) => ipcRenderer.invoke('kanbots:cloud:comments-add', args) as Promise<CommentSummary>,
  cloudAttachmentsList: (args: { orgSlug: string; projectSlug: string; number: number }) =>
    ipcRenderer.invoke('kanbots:cloud:attachments-list', args) as Promise<AttachmentListResponse>,
  cloudRunsListForCard: (args: { orgSlug: string; projectSlug: string; number: number }) =>
    ipcRenderer.invoke('kanbots:cloud:runs-list-for-card', args) as Promise<AgentRunListResponse>,
  cloudRunsCreate: (args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
    body: CreateAgentRunRequest;
  }) => ipcRenderer.invoke('kanbots:cloud:runs-create', args) as Promise<AgentRunSummary>,
  /**
   * Cloud-mode equivalent of issues:start-agent. Creates a run on the cloud,
   * claims it, spawns the local Claude/Codex CLI in the bound repo, and
   * streams events to /agent/runs/:id/events. Returns the runId
   * immediately; the CLI keeps running in the background.
   */
  cloudStartAgentRun: (args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
    prompt: string;
    appendSystemPrompt?: string;
    model?: string;
    provider?:
      | 'claude-code'
      | 'codex-cli'
      | 'gemini-cli'
      | 'amp-cli'
      | 'cursor-cli'
      | 'copilot-cli'
      | 'opencode-cli'
      | 'droid-cli'
      | 'ccr-cli'
      | 'qwen-cli'
      | 'acp';
  }) =>
    ipcRenderer.invoke('kanbots:cloud:start-agent-run', args) as Promise<{
      runId: string;
    }>,
  workspaceCurrentRoot: () =>
    ipcRenderer.invoke('kanbots:workspace:current-root') as Promise<{
      repoRoot: string | null;
    }>,
  workspaceReadDir: (args: { rootPath: string; relPath: string }) =>
    ipcRenderer.invoke('kanbots:workspace:read-dir', args) as Promise<
      Array<{ name: string; path: string; type: 'file' | 'dir' }>
    >,
  workspaceWorktreeStatus: (args: { rootPath: string }) =>
    ipcRenderer.invoke('kanbots:workspace:worktree-status', args) as Promise<{
      files: Record<
        string,
        { status: 'M' | 'A' | 'D' | 'R' | '??' | 'U'; worktrees: string[] }
      >;
      worktrees: string[];
    }>,
  workspaceSubscribeTouched: (
    handler: (payload: { filePath: string; worktreePath: string | null }) => void,
  ) => {
    void ipcRenderer.invoke('kanbots:workspace:subscribe-touched');
    const listener = (
      _e: unknown,
      payload: { filePath: string; worktreePath: string | null },
    ): void => handler(payload);
    ipcRenderer.on('kanbots:workspace:touched', listener);
    return () => ipcRenderer.off('kanbots:workspace:touched', listener);
  },
  workspaceListWorktrees: (args: { rootPath: string }) =>
    ipcRenderer.invoke('kanbots:workspace:list-worktrees', args) as Promise<
      Array<{
        path: string;
        branch: string | null;
        head: string | null;
        isMain: boolean;
        locked: boolean;
        detached: boolean;
        dirtyCount: number;
      }>
    >,
  workspaceRevealPath: (args: { path: string }) =>
    ipcRenderer.invoke('kanbots:workspace:reveal-path', args) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  workspaceCopyPath: (args: { path: string }) =>
    ipcRenderer.invoke('kanbots:workspace:copy-path', args) as Promise<{
      ok: boolean;
    }>,
  workspaceRemoveWorktree: (args: { path: string; force?: boolean }) =>
    ipcRenderer.invoke('kanbots:workspace:remove-worktree', args) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  workspaceFileDiff: (args: { worktreePath: string; filePath: string }) =>
    ipcRenderer.invoke('kanbots:workspace:file-diff', args) as Promise<{
      status: 'M' | 'A' | 'D' | 'R' | '??' | 'U' | null;
      oldText: string | null;
      newText: string | null;
    }>,
  workspaceFileRead: (args: { filePath: string }) =>
    ipcRenderer.invoke('kanbots:workspace:file-read', args) as Promise<{
      content: string | null;
      size: number;
      truncated: boolean;
      isBinary: boolean;
      error: string | null;
    }>,
  cloudRunsGet: (args: { orgSlug: string; projectSlug: string; runId: string }) =>
    ipcRenderer.invoke('kanbots:cloud:runs-get', args) as Promise<AgentRunSummary>,
  cloudRunsStreamStart: (args: {
    orgSlug: string;
    projectSlug: string;
    runId: string;
    lastEventId?: string;
  }) =>
    ipcRenderer.invoke('kanbots:cloud:runs-stream-start', args) as Promise<{
      subscriptionId: string;
    }>,
  cloudRunsStreamStop: (subscriptionId: string) =>
    ipcRenderer.invoke('kanbots:cloud:runs-stream-stop', subscriptionId) as Promise<void>,
  cloudCostToday: (orgSlug: string) =>
    ipcRenderer.invoke('kanbots:cloud:cost-today', orgSlug) as Promise<{
      totalUsd: number;
      since: string;
    }>,
  openCloudWorkspace: (args: { orgSlug: string; projectSlug: string }) =>
    ipcRenderer.invoke('kanbots:open-cloud-workspace', args) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  closeCloudWorkspace: () =>
    ipcRenderer.invoke('kanbots:close-cloud-workspace') as Promise<void>,
  recentCloudWorkspaces: () =>
    ipcRenderer.invoke('kanbots:recent-cloud-workspaces') as Promise<RecentCloudWorkspace[]>,
  cloudProjectBindingGet: (args: { orgSlug: string; projectSlug: string }) =>
    ipcRenderer.invoke('kanbots:cloud:project-binding-get', args) as Promise<
      { localRepoPath: string; updatedAt: string } | null
    >,
  cloudProjectBindingSet: (args: {
    orgSlug: string;
    projectSlug: string;
    localRepoPath: string;
  }) =>
    ipcRenderer.invoke('kanbots:cloud:project-binding-set', args) as Promise<{
      localRepoPath: string;
      updatedAt: string;
    }>,
  cloudProjectBindingClear: (args: { orgSlug: string; projectSlug: string }) =>
    ipcRenderer.invoke('kanbots:cloud:project-binding-clear', args) as Promise<void>,
  setNotifyOnRunComplete: (enabled: boolean) =>
    ipcRenderer.invoke('kanbots:set-notify-on-run-complete', enabled) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  openChat: (conversationId: number | null) =>
    ipcRenderer.invoke('kanbots:open-chat', conversationId) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  invoke: <C extends ChannelName>(channel: C, args: ChannelArgs<C>) =>
    ipcRenderer.invoke(`${INVOKE_PREFIX}${channel}`, args) as Promise<ChannelResult<C>>,
  subscribe: (eventName: string, listener: (payload: unknown) => void) => {
    const wrap = (_event: IpcRendererEvent, payload: unknown): void => listener(payload);
    ipcRenderer.on(eventName, wrap);
    return () => {
      ipcRenderer.removeListener(eventName, wrap);
    };
  },
};

contextBridge.exposeInMainWorld('kanbots', api);
