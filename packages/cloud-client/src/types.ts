/**
 * Response/request shapes for the Kanbots Cloud v1 API. These mirror
 * the cloud-side `@kanbots/shared/api-types` definitions but are
 * intentionally duplicated here so the desktop app doesn't need to
 * pull in the cloud's zod runtime.
 */

export interface UserMe {
  id: string;
  primary_email: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
  locale: string | null;
  timezone: string | null;
  mfa_enabled: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
}

export type OrgTier = 'free' | 'pro' | 'business' | 'enterprise';
export type OrgRole = 'org:owner' | 'org:admin' | 'org:member' | 'org:guest';

export interface OrgSummary {
  id: string;
  slug: string;
  display_name: string;
  tier: OrgTier;
  role: OrgRole;
  created_at: string;
}

export interface OrgListResponse {
  data: OrgSummary[];
  next_cursor: string | null;
}

export interface CreateOrgRequest {
  display_name: string;
  slug?: string;
}

export interface CreateOrgResponse {
  id: string;
  slug: string;
  display_name: string;
  tier: OrgTier;
  role: OrgRole;
  trial_ends_at: string | null;
  created_at: string;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  github_repo: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectListResponse {
  data: ProjectSummary[];
}

export interface CreateProjectRequest {
  display_name: string;
  slug?: string;
  description?: string;
  github_repo?: string;
}

export type CardStatus =
  | 'inbox'
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'blocked'
  | 'archived';

/**
 * Most recent agent run for a card, surfaced inline on `CardSummary`
 * so the board renders running/blocked/failed state without a separate
 * runs.list call. Null when no run has ever been dispatched.
 */
export interface CardSummaryLatestRun {
  id: string;
  status: AgentRunStatus;
  started_at: string;
  cost_usd_cents: number;
}

export interface CardSummary {
  id: string;
  number: number;
  title: string;
  body: string;
  status: CardStatus;
  position: string;
  assignee_id: string | null;
  reporter_id: string;
  parent_card_id: string | null;
  comment_count: number;
  run_count: number;
  attachment_count: number;
  latest_run: CardSummaryLatestRun | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardListResponse {
  data: CardSummary[];
  next_cursor: string | null;
}

export interface ListCardsQuery {
  status?: CardStatus[];
  assignee_user_id?: string;
  cursor?: string;
  limit?: number;
  include_archived?: boolean;
}

export interface CreateCardRequest {
  title: string;
  body?: string;
  status?: CardStatus;
  position?: string;
  assignee_user_id?: string;
  parent_card_id?: string;
}

export interface UpdateCardRequest {
  title?: string;
  body?: string;
  status?: CardStatus;
  position?: string;
  assignee_user_id?: string | null;
}

export interface CommentSummary {
  id: string;
  card_id: string;
  /**
   * Threaded-reply parent, null for top-level comments. The cloud
   * comments route surfaces this field — pre-fix the local type
   * dropped it, so a threaded comment from the cloud silently lost
   * its parent link in the renderer. See bug `sync-13`.
   */
  parent_comment_id: string | null;
  /**
   * Null for system-authored comments (autopilot summaries, run
   * outcome stickers). The cloud route returns null in that case; the
   * old non-nullable type let `String(null)` produce the literal
   * `"null"` everywhere a renderer destructured the field.
   */
  author_user_id: string | null;
  body: string;
  edited_at: string | null;
  created_at: string;
}

export interface CommentListResponse {
  data: CommentSummary[];
  next_cursor: string | null;
}

export interface AttachmentSummary {
  id: string;
  card_id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  uploaded_by_user_id: string;
  url: string;
  created_at: string;
}

export interface AttachmentListResponse {
  data: AttachmentSummary[];
}

// Mirror cloud `@kanbots/shared` AgentRunStatusEnum. Values were stale
// here ('awaiting_decision'/'completed'/'cancelled') — the server emits
// the shared enum, so anything that branched on the old values would
// silently fall through.
export type AgentRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_input'
  | 'succeeded'
  | 'failed'
  | 'stopped'
  | 'timed_out';

export interface AgentRunSummary {
  id: string;
  card_id: string;
  project_id: string;
  started_by_user_id: string | null;
  cli: string;
  model: string;
  provider: string;
  worktree_path: string | null;
  branch_name: string | null;
  status: AgentRunStatus;
  total_tokens_input: number;
  total_tokens_output: number;
  cost_usd_cents: number;
  event_count: number;
  duration_ms: number | null;
  last_event_at: string | null;
  started_at: string;
  ended_at: string | null;
  stop_reason: string | null;
  resumed_from_run_id: string | null;
  autopilot_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRunListResponse {
  data: AgentRunSummary[];
  next_cursor: string | null;
}

export interface CreateAgentRunRequest {
  cli?: string;
  model?: string;
  provider?: string;
}

/**
 * Promotion record per `cloud/packages/db/src/schema/promotions.ts`.
 * Surfaced as the response body for `runs.promote`. See bug `sync-07`.
 */
export type PromotionKind = 'commit' | 'pr' | 'discard';
export type PromotionStatus = 'draft' | 'opened_pr' | 'merged' | 'abandoned';

export interface PromotionSummary {
  id: string;
  card_id: string;
  agent_run_id: string | null;
  kind: PromotionKind;
  status: PromotionStatus;
  source_branch: string | null;
  target_branch: string | null;
  commit_sha: string | null;
  pr_provider: string | null;
  pr_url: string | null;
  pr_number: number | null;
  pr_merged_at: string | null;
  pr_closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromoteRequest {
  kind: PromotionKind;
  source_branch?: string;
  target_branch?: string;
  commit_sha?: string;
  pr_provider?: string;
  pr_url?: string;
  pr_number?: number;
  abandoned_reason?: string;
}

/**
 * Label as exposed by the cloud `/projects/:p/labels` endpoints. Per
 * bug `sync-14` — the labels schema exists in the cloud DB but had no
 * API surface; this is the client-side shape mirroring the cloud row.
 */
export interface LabelSummary {
  id: string;
  project_id: string;
  name: string;
  color: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiErrorBody {
  error: { code: string; message?: string; detail?: unknown };
}
