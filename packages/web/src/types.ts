// Web-side type aliases. The canonical domain types live in `@kanbots/core`
// and bridge/view types live in `@kanbots/api`; this module re-exports them
// under the names the renderer was already using and adds view-only types.

import type {
  Comment,
  DecoratedIssue,
  IssueActiveRunPayload,
  IssueDetail as ApiIssueDetail,
  PreviewState,
  PreviewStatePayload as ApiPreviewStatePayload,
  ThreadPayload,
} from '@kanbots/api';
import type {
  CreateIssueInput,
  Issue as CoreIssue,
  IssueRef,
  StatusKey,
} from '@kanbots/core';

export type { CreateIssueInput, IssueRef, StatusKey } from '@kanbots/core';

export interface IssueRelationPayload {
  id: number;
  parentNumber: IssueRef;
  childNumber: IssueRef;
  child: {
    number: IssueRef;
    title: string;
    status: StatusKey | null;
    state: 'open' | 'closed';
  };
  createdAt: string;
}

export type {
  AgentCheck,
  AgentEvent,
  AgentEventType,
  AgentKey,
  AgentRun,
  AgentRunStatus,
  AutopilotCheckCommand,
  AutopilotChildEntry,
  AutopilotChildKind,
  AutopilotChildStatus,
  AutopilotConfig,
  AutopilotKind,
  AutopilotPersonaSnapshot,
  AutopilotPlanningEvent,
  AutopilotPlanningSlot,
  AutopilotSession,
  AutopilotStatus,
  Card,
  CardStatus,
  CardTemplatePayload,
  CardType,
  ChatConversation,
  ChatPayload,
  ChatPostMessageResult,
  ChatSessionPayload,
  ChatSessionStatus,
  CheckKind,
  Comment,
  Config,
  CostBreakdownItem,
  DecisionPayload,
  DiffFile,
  DiffFileStatus,
  DiffPayload,
  DraftedIssue,
  DraftedPrDescription,
  Message,
  PendingDecisionPayload,
  PrCommentPayload,
  PrCommentsListResult,
  ProviderConfigPayload,
  ProviderId,
  ProviderSaveInput,
  ProviderSettingsInput,
  ProviderSettingsPayload,
  ProviderTestConnectionResult,
  ProvidersPayload,
  ReviewCommentPayload,
  Role,
  SentryConfigInput,
  SentryConfigPayload,
  SentryImportStatus,
  SentryMetaPayload,
  SentrySuggestion,
  SentrySuggestionCategory,
  SentrySuggestionConfidence,
  SentrySuggestionVerdict,
  SentrySyncResult,
  SentryTestConnectionResult,
  SpecPayload,
  ShipCommitResult,
  ShipMergeResult,
  ShipPRResult,
  ShipStatus,
  SlashCommandPayload,
  UpdateIssuePatch,
  Workspace,
  WorkspaceAcpCommandBridgePayload,
  WorkspaceBudgets,
  WorkspaceFolderPayload,
  WorkspaceHouseRules,
  WorkspaceRepoPayload,
  WorkspaceRepoStatus,
  WorkspaceScriptsBridgePayload,
  WorkspaceRunScriptResult,
} from '@kanbots/api';

// User shape isn't in @kanbots/api directly — it's the inline type on
// `Comment.user` and `Issue.user`. Pull it off Comment for convenience.
export type User = Comment['user'];

export type IssueState = 'open' | 'closed';

// In the UI, `Issue` always means the decorated issue (with status,
// agent, activeRun) — the renderer never sees the bare GitHub Issue.
export type Issue = DecoratedIssue & CoreIssue;

// Same convention: the renderer-facing active-run shape is the payload
// shape from the bridge, not the wider supervisor `AgentRun`.
export type IssueActiveRun = IssueActiveRunPayload;

export type Thread = ThreadPayload;
export type IssueDetail = Omit<ApiIssueDetail, 'issue'> & { issue: Issue };

// Web's preview UI strictly types `state` to the live state union; the
// bridge keeps it as `PreviewState | string` for forward-compat. Narrow
// here for renderer code.
export interface PreviewStatePayload extends Omit<ApiPreviewStatePayload, 'state'> {
  state: PreviewState;
}
