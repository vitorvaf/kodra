import type { WorkspaceConfig } from '@kanbots/local-store';
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

export interface ActiveWorkspaceInfo {
  repoPath: string;
  config: WorkspaceConfig;
}

/**
 * Free-floating cloud workspace — no git repo on disk. The desktop
 * acts as a thick HTTP client over an org+project on Kanbots Cloud.
 * Agent dispatch in this mode prompts for a local repo at run time
 * (or uses a pinned `localRepoPath` if the user bound one to the
 * project; see P4).
 */
export interface ActiveCloudWorkspaceInfo {
  orgSlug: string;
  orgDisplayName: string;
  projectSlug: string;
  projectDisplayName: string;
  /** Pinned local repo for agent dispatch; null until P4 binds one. */
  localRepoPath: string | null;
}

export interface RecentWorkspace {
  repoPath: string;
  displayName: string;
  lastOpenedAt: string;
}

export interface RecentCloudWorkspace {
  orgSlug: string;
  orgDisplayName: string;
  projectSlug: string;
  projectDisplayName: string;
  lastOpenedAt: string;
}

export interface BootstrapPayload {
  workspace: ActiveWorkspaceInfo | null;
  cloudWorkspace: ActiveCloudWorkspaceInfo | null;
  recents: RecentWorkspace[];
  cloudRecents: RecentCloudWorkspace[];
  claudeAuthed: boolean;
  codexAuthed: boolean;
  geminiAuthed: boolean;
  ampAuthed: boolean;
  cursorAuthed: boolean;
  copilotAuthed: boolean;
  opencodeAuthed: boolean;
  droidAuthed: boolean;
  ccrAuthed: boolean;
  qwenAuthed: boolean;
  cloudAuthed: boolean;
  cloudPromptDismissed: boolean;
}

export interface CloudStatusPayload {
  authed: boolean;
  baseUrl: string | null;
  tokenPrefix: string | null;
  orgId: string | null;
  signedInAt: string | null;
  promptDismissed: boolean;
}

export type CloudLoginStartResult =
  | {
      ok: true;
      userCode: string;
      verificationUri: string;
      verificationUriComplete: string;
      expiresAt: number;
      intervalMs: number;
    }
  | { ok: false; error: string };

export type CloudLoginPollResult =
  | { status: 'pending' }
  | { status: 'expired' | 'consumed' | 'cancelled' }
  | { status: 'approved'; tokenPrefix: string; orgId: string | null }
  | { status: 'error'; error: string }
  | { status: 'idle' };

export interface KanbotsBridge {
  bootstrap(): Promise<BootstrapPayload>;
  pickFolder(): Promise<string | null>;
  openWorkspace(repoPath: string): Promise<{ ok: true } | { ok: false; error: string }>;
  closeWorkspace(): Promise<void>;
  recentWorkspaces(): Promise<RecentWorkspace[]>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  claudeAuthStatus(): Promise<{ authed: boolean }>;
  claudeLoginStart(): Promise<{ ok: true } | { ok: false; error: string }>;
  claudeLoginCancel(): Promise<void>;
  codexAuthStatus(): Promise<{ authed: boolean }>;
  codexLoginStart(): Promise<{ ok: true } | { ok: false; error: string }>;
  codexLoginCancel(): Promise<void>;
  geminiAuthStatus(): Promise<{ authed: boolean }>;
  geminiLoginStart(): Promise<{ ok: true } | { ok: false; error: string }>;
  geminiLoginCancel(): Promise<void>;
  ampAuthStatus(): Promise<{ authed: boolean }>;
  ampLoginStart(): Promise<{ ok: true } | { ok: false; error: string }>;
  ampLoginCancel(): Promise<void>;
  cursorAuthStatus(): Promise<{ authed: boolean }>;
  cursorLoginStart(): Promise<{ ok: true } | { ok: false; error: string }>;
  cursorLoginCancel(): Promise<void>;
  copilotAuthStatus(): Promise<{ authed: boolean }>;
  copilotLoginStart(): Promise<{ ok: true } | { ok: false; error: string }>;
  copilotLoginCancel(): Promise<void>;
  opencodeAuthStatus(): Promise<{ authed: boolean }>;
  opencodeLoginStart(): Promise<{ ok: true } | { ok: false; error: string }>;
  opencodeLoginCancel(): Promise<void>;
  droidAuthStatus(): Promise<{ authed: boolean }>;
  droidLoginStart(): Promise<{ ok: true } | { ok: false; error: string }>;
  droidLoginCancel(): Promise<void>;
  ccrAuthStatus(): Promise<{ authed: boolean }>;
  ccrLoginStart(): Promise<{ ok: true } | { ok: false; error: string }>;
  ccrLoginCancel(): Promise<void>;
  qwenAuthStatus(): Promise<{ authed: boolean }>;
  qwenLoginStart(): Promise<{ ok: true } | { ok: false; error: string }>;
  qwenLoginCancel(): Promise<void>;
  cloudAuthStatus(): Promise<CloudStatusPayload>;
  cloudLoginStart(opts?: { baseUrl?: string }): Promise<CloudLoginStartResult>;
  cloudLoginPoll(): Promise<CloudLoginPollResult>;
  cloudLoginCancel(): Promise<void>;
  cloudLogout(): Promise<void>;
  cloudPromptDismiss(): Promise<void>;
  cloudUsersMe(): Promise<UserMe>;
  cloudOrgsList(opts?: { cursor?: string; limit?: number }): Promise<OrgListResponse>;
  cloudOrgsCreate(body: CreateOrgRequest): Promise<CreateOrgResponse>;
  cloudProjectsList(orgSlug: string): Promise<ProjectListResponse>;
  cloudProjectsCreate(args: { orgSlug: string; body: CreateProjectRequest }): Promise<ProjectSummary>;
  openCloudWorkspace(args: {
    orgSlug: string;
    projectSlug: string;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
  closeCloudWorkspace(): Promise<void>;
  recentCloudWorkspaces(): Promise<RecentCloudWorkspace[]>;
  cloudProjectBindingGet(args: {
    orgSlug: string;
    projectSlug: string;
  }): Promise<{ localRepoPath: string; updatedAt: string } | null>;
  cloudProjectBindingSet(args: {
    orgSlug: string;
    projectSlug: string;
    localRepoPath: string;
  }): Promise<{ localRepoPath: string; updatedAt: string }>;
  cloudProjectBindingClear(args: {
    orgSlug: string;
    projectSlug: string;
  }): Promise<void>;
  cloudCardsList(args: {
    orgSlug: string;
    projectSlug: string;
    query?: ListCardsQuery;
  }): Promise<CardListResponse>;
  cloudCardsCreate(args: {
    orgSlug: string;
    projectSlug: string;
    body: CreateCardRequest;
  }): Promise<CardSummary>;
  cloudCardsGet(args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
  }): Promise<CardSummary>;
  cloudCardsUpdate(args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
    body: UpdateCardRequest;
    ifMatch?: string;
  }): Promise<CardSummary>;
  cloudCardsArchive(args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
  }): Promise<void>;
  cloudCardsUnarchive(args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
  }): Promise<CardSummary>;
  cloudCommentsList(args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
  }): Promise<CommentListResponse>;
  cloudCommentsAdd(args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
    body: string;
  }): Promise<CommentSummary>;
  cloudAttachmentsList(args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
  }): Promise<AttachmentListResponse>;
  cloudRunsListForCard(args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
  }): Promise<AgentRunListResponse>;
  cloudRunsCreate(args: {
    orgSlug: string;
    projectSlug: string;
    number: number;
    body: CreateAgentRunRequest;
  }): Promise<AgentRunSummary>;
  cloudStartAgentRun(args: {
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
  }): Promise<{ runId: string }>;
  workspaceCurrentRoot(): Promise<{ repoRoot: string | null }>;
  workspaceReadDir(args: {
    rootPath: string;
    relPath: string;
  }): Promise<Array<{ name: string; path: string; type: 'file' | 'dir' }>>;
  workspaceWorktreeStatus(args: {
    rootPath: string;
  }): Promise<{
    files: Record<
      string,
      { status: 'M' | 'A' | 'D' | 'R' | '??' | 'U'; worktrees: string[] }
    >;
    worktrees: string[];
  }>;
  workspaceSubscribeTouched(
    handler: (payload: { filePath: string; worktreePath: string | null }) => void,
  ): () => void;
  workspaceListWorktrees(args: { rootPath: string }): Promise<
    Array<{
      path: string;
      branch: string | null;
      head: string | null;
      isMain: boolean;
      locked: boolean;
      detached: boolean;
      dirtyCount: number;
    }>
  >;
  workspaceRevealPath(args: { path: string }): Promise<{ ok: boolean; error?: string }>;
  workspaceCopyPath(args: { path: string }): Promise<{ ok: boolean }>;
  workspaceRemoveWorktree(args: {
    path: string;
    force?: boolean;
  }): Promise<{ ok: boolean; error?: string }>;
  workspaceFileDiff(args: { worktreePath: string; filePath: string }): Promise<{
    status: 'M' | 'A' | 'D' | 'R' | '??' | 'U' | null;
    oldText: string | null;
    newText: string | null;
  }>;
  workspaceFileRead(args: { filePath: string }): Promise<{
    content: string | null;
    size: number;
    truncated: boolean;
    isBinary: boolean;
    error: string | null;
  }>;
  cloudRunsGet(args: {
    orgSlug: string;
    projectSlug: string;
    runId: string;
  }): Promise<AgentRunSummary>;
  cloudRunsStreamStart(args: {
    orgSlug: string;
    projectSlug: string;
    runId: string;
    lastEventId?: string;
  }): Promise<{ subscriptionId: string }>;
  cloudRunsStreamStop(subscriptionId: string): Promise<void>;
  cloudCostToday(orgSlug: string): Promise<{ totalUsd: number; since: string }>;
  setNotifyOnRunComplete(
    enabled: boolean,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  openChat?(
    conversationId: number | null,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  invoke<C extends ChannelName>(channel: C, args: ChannelArgs<C>): Promise<ChannelResult<C>>;
  subscribe(eventName: string, listener: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    kanbots?: KanbotsBridge;
  }
}
