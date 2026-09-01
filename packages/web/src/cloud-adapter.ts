import type { AgentRunStatus, CardStatus, CardSummary } from '@kanbots/cloud-client';
import type { AgentKey, Issue, IssueActiveRun, IssueDetail, StatusKey } from './types.js';

/**
 * Cloud-only launch — phase 1 unification: when a cloud workspace is open
 * the renderer uses local-mode hooks/components fed by an adapter that maps
 * cloud `CardSummary` → `DecoratedIssue` (the type Board.tsx and the rest
 * of the renderer expect). This file owns those mappings in one place.
 *
 * Status mapping:
 *   cloud 'inbox'        ↔ local null (untagged)
 *   cloud 'backlog'      ↔ local 'backlog'
 *   cloud 'ready'        ↔ local 'todo'
 *   cloud 'in_progress'  ↔ local 'inProgress'
 *   cloud 'review'       ↔ local 'review'
 *   cloud 'done'         ↔ local 'done'
 *   cloud 'blocked'      → local null (until Board grows a blocked column)
 *   cloud 'archived'     → filtered out by callers, never rendered
 */
export function cloudStatusToLocal(status: CardStatus): StatusKey | null {
  switch (status) {
    case 'backlog':
      return 'backlog';
    case 'ready':
      return 'todo';
    case 'in_progress':
      return 'inProgress';
    case 'review':
      return 'review';
    case 'done':
      return 'done';
    case 'inbox':
    case 'blocked':
    case 'archived':
      return null;
  }
}

export function localStatusToCloud(status: StatusKey | null): CardStatus {
  if (status === null) return 'inbox';
  switch (status) {
    case 'backlog':
      return 'backlog';
    case 'todo':
      return 'ready';
    case 'inProgress':
      return 'in_progress';
    case 'review':
      return 'review';
    case 'done':
      return 'done';
  }
}

/**
 * Translates a local-mode label patch (used by drag-drop) into the cloud
 * status the API expects. The renderer encodes status as a `status:<key>`
 * label on each card (e.g. `status:in-progress`, kebab-cased — see
 * STATUS_LABEL_NAMES in labels.ts); we look for that label here and map to
 * CardStatus.
 */
const LABEL_TO_CLOUD_STATUS: Record<string, CardStatus> = {
  backlog: 'backlog',
  todo: 'ready',
  'in-progress': 'in_progress',
  review: 'review',
  done: 'done',
};

export function statusFromLabels(labels: readonly string[]): CardStatus | null {
  for (const label of labels) {
    if (!label.startsWith('status:')) continue;
    const key = label.slice('status:'.length);
    const mapped = LABEL_TO_CLOUD_STATUS[key];
    if (mapped !== undefined) return mapped;
  }
  return null;
}

const PLACEHOLDER_USER = { login: 'cloud', avatarUrl: null } as const;

/**
 * Maps cloud agent-run status → local renderer's AgentKey union. Only
 * terminal succeeded runs map to `null` (no badge); failed/cancelled
 * surface as 'failed' so the user knows the last attempt didn't land.
 */
export function agentFromRunStatus(status: AgentRunStatus): AgentKey | null {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'running':
      return 'running';
    case 'awaiting_input':
      return 'blocked';
    case 'failed':
    case 'timed_out':
      return 'failed';
    case 'succeeded':
    case 'stopped':
      return null;
  }
}

// Cloud runs are KSUID strings, but DecoratedIssue.activeRun.id is typed
// as a number. For cloud cards we surface a synthetic numeric id derived
// from the card number so downstream maps still work; the canonical
// identifier — `cloudRunId` — lives alongside it so streaming hooks can
// open an SSE subscription against /projects/:p/runs/:cloudRunId/stream.
const RUNNING_CLOUD_STATUSES = new Set(['pending', 'running', 'awaiting_input']);

// Cloud and local AgentRunStatus enums diverge (`pending` vs `starting`,
// `succeeded`+`timed_out` vs `complete`). Map the cloud enum onto the
// local one so DecoratedIssue.activeRun typechecks without widening the
// renderer's status type.
function cloudStatusToLocalRunStatus(status: AgentRunStatus): IssueActiveRun['status'] {
  switch (status) {
    case 'pending':
      return 'starting';
    case 'running':
      return 'running';
    case 'awaiting_input':
      return 'awaiting_input';
    case 'succeeded':
      return 'complete';
    case 'failed':
    case 'timed_out':
      return 'failed';
    case 'stopped':
      return 'stopped';
    default:
      return 'running';
  }
}

function cloudActiveRunFor(card: CardSummary): IssueActiveRun | null {
  const lr = card.latest_run;
  if (lr === null) return null;
  if (!RUNNING_CLOUD_STATUSES.has(lr.status)) return null;
  return {
    id: card.number,
    status: cloudStatusToLocalRunStatus(lr.status),
    branch: null,
    model: null,
    startedAt: lr.started_at,
    currentTool: null,
    currentArg: null,
    totalCostUsd: lr.cost_usd_cents / 100,
    pendingDecision: null,
    checks: null,
    previewUrl: null,
    previewState: null,
    cloudRunId: lr.id,
  };
}

export function cardToIssue(card: CardSummary): Issue {
  const status = cloudStatusToLocal(card.status);
  const labels: string[] = [];
  if (status !== null) labels.push(`status:${status}`);
  const agent = card.latest_run !== null ? agentFromRunStatus(card.latest_run.status) : null;
  if (agent !== null) labels.push(`agent:${agent}`);
  return {
    number: card.number,
    title: card.title,
    body: card.body ?? '',
    state: card.archived_at !== null ? 'closed' : 'open',
    labels,
    assignees: [],
    user: PLACEHOLDER_USER,
    createdAt: card.created_at,
    updatedAt: card.updated_at,
    closedAt: card.archived_at,
    htmlUrl: '',
    isPullRequest: false,
    status,
    agent,
    activeRun: cloudActiveRunFor(card),
    sentryMeta: null,
    // Always expose the latest cloud run id (even when terminal) so the
    // detail modal can replay the run's events via SSE after it
    // finishes — without it the thread goes blank on the next render.
    ...(card.latest_run !== null ? { cloudLatestRunId: card.latest_run.id } : {}),
  };
}

export function cardsToIssues(cards: readonly CardSummary[]): Issue[] {
  return cards.filter((c) => c.archived_at === null).map(cardToIssue);
}

/**
 * Synthetic IssueDetail constructed from a CardSummary. Comments and the
 * agent thread are stubbed empty — wiring those through `cloudCommentsList`
 * and `cloudRunsListForCard` is part of phase 2/4.
 */
export function cardToIssueDetail(card: CardSummary): IssueDetail {
  return {
    issue: cardToIssue(card),
    comments: [],
    thread: null,
  };
}
