import type { Db } from '../db.js';
import type {
  AgentRun,
  AgentRunId,
  AgentRunStatus,
  ChatSessionId,
  PreviewState,
  SuccessSignal,
  ThreadId,
} from '../types.js';

interface AgentRunRow {
  id: number;
  thread_id: number;
  worktree_path: string | null;
  branch_name: string | null;
  pid: number | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  token_usage_input: number | null;
  token_usage_output: number | null;
  exit_reason: string | null;
  stop_escalation: string | null;
  session_id: string | null;
  model: string | null;
  provider: string | null;
  total_cost_usd: number | null;
  cost_budget_usd: number | null;
  duration_ms: number | null;
  preview_url: string | null;
  preview_state: string | null;
  preview_pid: number | null;
  persona_id: string | null;
  card_kind: string | null;
  card_size_bucket: string | null;
  issue_body_chars: number | null;
  success_signal: string | null;
  // The chat-session FK added in migration 0027. Distinct from
  // `session_id` above — that one is the dispatcher's stream-resume token.
  // Renaming was rejected (the dispatcher resume path reads `session_id`
  // by name), so the chat-session FK lives under its own column.
  chat_session_id: number | null;
}

function rowToAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    threadId: row.thread_id,
    worktreePath: row.worktree_path,
    branchName: row.branch_name,
    pid: row.pid,
    status: row.status as AgentRunStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    tokenUsageInput: row.token_usage_input,
    tokenUsageOutput: row.token_usage_output,
    exitReason: row.exit_reason,
    stopEscalation: (row.stop_escalation as AgentRun['stopEscalation']) ?? null,
    sessionId: row.session_id,
    model: row.model,
    provider: row.provider,
    totalCostUsd: row.total_cost_usd,
    costBudgetUsd: row.cost_budget_usd,
    durationMs: row.duration_ms,
    previewUrl: row.preview_url,
    previewState: (row.preview_state as PreviewState | null) ?? null,
    previewPid: row.preview_pid,
    personaId: row.persona_id,
    cardKind: row.card_kind,
    cardSizeBucket: row.card_size_bucket,
    issueBodyChars: row.issue_body_chars,
    successSignal: (row.success_signal as SuccessSignal | null) ?? null,
    chatSessionId: row.chat_session_id,
  };
}

export interface CreateAgentRunInput {
  threadId: ThreadId;
  status?: AgentRunStatus;
  worktreePath?: string;
  branchName?: string;
  /** Chat-session scope for runs that belong to a multi-session chat. */
  chatSessionId?: ChatSessionId | null;
}

export interface UpdateAgentRunPatch {
  status?: AgentRunStatus;
  worktreePath?: string | null;
  branchName?: string | null;
  pid?: number | null;
  endedAt?: string | null;
  tokenUsageInput?: number | null;
  tokenUsageOutput?: number | null;
  exitReason?: string | null;
  stopEscalation?: 'sigterm' | 'sigkill' | null;
  sessionId?: string | null;
  model?: string | null;
  provider?: string | null;
  totalCostUsd?: number | null;
  costBudgetUsd?: number | null;
  durationMs?: number | null;
  previewUrl?: string | null;
  previewState?: PreviewState | null;
  previewPid?: number | null;
  personaId?: string | null;
  cardKind?: string | null;
  cardSizeBucket?: string | null;
  issueBodyChars?: number | null;
  successSignal?: SuccessSignal | null;
  chatSessionId?: ChatSessionId | null;
}

const PATCH_COLUMNS: Record<keyof UpdateAgentRunPatch, string> = {
  status: 'status',
  worktreePath: 'worktree_path',
  branchName: 'branch_name',
  pid: 'pid',
  endedAt: 'ended_at',
  tokenUsageInput: 'token_usage_input',
  tokenUsageOutput: 'token_usage_output',
  exitReason: 'exit_reason',
  stopEscalation: 'stop_escalation',
  sessionId: 'session_id',
  model: 'model',
  provider: 'provider',
  totalCostUsd: 'total_cost_usd',
  costBudgetUsd: 'cost_budget_usd',
  durationMs: 'duration_ms',
  previewUrl: 'preview_url',
  previewState: 'preview_state',
  previewPid: 'preview_pid',
  personaId: 'persona_id',
  cardKind: 'card_kind',
  cardSizeBucket: 'card_size_bucket',
  issueBodyChars: 'issue_body_chars',
  successSignal: 'success_signal',
  chatSessionId: 'chat_session_id',
};

const ACTIVE_STATUSES = "('starting', 'running', 'awaiting_input')";

export class AgentRunsRepo {
  constructor(private readonly db: Db) {}

  create(input: CreateAgentRunInput): AgentRun {
    const startedAt = new Date().toISOString();
    const status = input.status ?? 'starting';
    const worktreePath = input.worktreePath ?? null;
    const branchName = input.branchName ?? null;
    const chatSessionId = input.chatSessionId ?? null;

    const result = this.db
      .prepare(
        `INSERT INTO agent_runs
           (thread_id, status, started_at, worktree_path, branch_name, success_signal, chat_session_id)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(input.threadId, status, startedAt, worktreePath, branchName, chatSessionId);

    return {
      id: Number(result.lastInsertRowid),
      threadId: input.threadId,
      worktreePath,
      branchName,
      pid: null,
      status,
      startedAt,
      endedAt: null,
      tokenUsageInput: null,
      tokenUsageOutput: null,
      exitReason: null,
      stopEscalation: null,
      sessionId: null,
      model: null,
      provider: null,
      totalCostUsd: null,
      costBudgetUsd: null,
      durationMs: null,
      previewUrl: null,
      previewState: null,
      previewPid: null,
      personaId: null,
      cardKind: null,
      cardSizeBucket: null,
      issueBodyChars: null,
      successSignal: 'pending',
      chatSessionId,
    };
  }

  update(id: AgentRunId, patch: UpdateAgentRunPatch): AgentRun {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const key of Object.keys(PATCH_COLUMNS) as (keyof UpdateAgentRunPatch)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      fields.push(`${PATCH_COLUMNS[key]} = ?`);
      values.push(value);
    }

    if (fields.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE agent_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const run = this.findById(id);
    if (!run) throw new Error(`AgentRun ${id} not found`);
    return run;
  }

  /** Conditional success_signal upgrade. Only writes if `next` is strictly
   *  higher than the existing rank, matching the monotonic semantics in
   *  canUpgradeSuccessSignal. Returns the row whether or not it was changed. */
  upgradeSuccessSignal(id: AgentRunId, next: SuccessSignal): AgentRun {
    const row = this.db
      .prepare('SELECT success_signal FROM agent_runs WHERE id = ?')
      .get(id) as { success_signal: string | null } | undefined;
    if (!row) throw new Error(`AgentRun ${id} not found`);
    const RANK: Record<SuccessSignal, number> = {
      pending: 0,
      failed: 1,
      stopped: 1,
      aborted_budget: 1,
      completed_with_failed_checks: 2,
      completed_clean: 3,
      promoted: 4,
    };
    const currentRank = row.success_signal ? RANK[row.success_signal as SuccessSignal] ?? 0 : 0;
    const nextRank = RANK[next];
    if (nextRank > currentRank) {
      this.db
        .prepare('UPDATE agent_runs SET success_signal = ? WHERE id = ?')
        .run(next, id);
    }
    const updated = this.findById(id);
    if (!updated) throw new Error(`AgentRun ${id} not found`);
    return updated;
  }

  findById(id: AgentRunId): AgentRun | null {
    const row = this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) as
      | AgentRunRow
      | undefined;
    return row ? rowToAgentRun(row) : null;
  }

  findActiveForThread(threadId: ThreadId): AgentRun | null {
    const row = this.db
      .prepare(
        `SELECT * FROM agent_runs WHERE thread_id = ? AND status IN ${ACTIVE_STATUSES}
         ORDER BY id DESC LIMIT 1`,
      )
      .get(threadId) as AgentRunRow | undefined;
    return row ? rowToAgentRun(row) : null;
  }

  findLatestForThread(threadId: ThreadId): AgentRun | null {
    const row = this.db
      .prepare('SELECT * FROM agent_runs WHERE thread_id = ? ORDER BY id DESC LIMIT 1')
      .get(threadId) as AgentRunRow | undefined;
    return row ? rowToAgentRun(row) : null;
  }

  findActiveForChatSession(chatSessionId: ChatSessionId): AgentRun | null {
    const row = this.db
      .prepare(
        `SELECT * FROM agent_runs WHERE chat_session_id = ? AND status IN ${ACTIVE_STATUSES}
         ORDER BY id DESC LIMIT 1`,
      )
      .get(chatSessionId) as AgentRunRow | undefined;
    return row ? rowToAgentRun(row) : null;
  }

  findLatestForChatSession(chatSessionId: ChatSessionId): AgentRun | null {
    const row = this.db
      .prepare(
        'SELECT * FROM agent_runs WHERE chat_session_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(chatSessionId) as AgentRunRow | undefined;
    return row ? rowToAgentRun(row) : null;
  }

  listByThread(threadId: ThreadId): AgentRun[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_runs WHERE thread_id = ? ORDER BY id')
      .all(threadId) as AgentRunRow[];
    return rows.map(rowToAgentRun);
  }

  listOrphans(): AgentRun[] {
    const rows = this.db
      .prepare(`SELECT * FROM agent_runs WHERE status IN ${ACTIVE_STATUSES} AND pid IS NOT NULL`)
      .all() as AgentRunRow[];
    return rows.map(rowToAgentRun);
  }

  listPreviewOrphans(): AgentRun[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_runs WHERE preview_pid IS NOT NULL')
      .all() as AgentRunRow[];
    return rows.map(rowToAgentRun);
  }

  // 'awaiting_input' is intentionally excluded — those runs have already exited
  // cleanly and are waiting for the user. They should resume on the next message.
  markStartingRunningAsInterrupted(reason: string): AgentRun[] {
    const rows = this.db
      .prepare(`SELECT * FROM agent_runs WHERE status IN ('starting', 'running')`)
      .all() as AgentRunRow[];
    if (rows.length === 0) return [];
    const endedAt = new Date().toISOString();
    const update = this.db.prepare(
      `UPDATE agent_runs SET status = 'failed', ended_at = ?, pid = NULL, exit_reason = ?
       WHERE id = ?`,
    );
    const txn = this.db.transaction((ids: number[]) => {
      for (const id of ids) update.run(endedAt, reason, id);
    });
    txn(rows.map((r) => r.id));
    return rows.map((r) => ({ ...rowToAgentRun(r), status: 'failed', endedAt, pid: null, exitReason: reason }));
  }

  sumCostByIds(ids: readonly number[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(total_cost_usd), 0) AS sum FROM agent_runs WHERE id IN (${placeholders})`,
      )
      .get(...ids) as { sum: number };
    return row.sum;
  }

  sumCostSince(isoDate: string): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(SUM(total_cost_usd), 0) AS sum FROM agent_runs WHERE started_at >= ?',
      )
      .get(isoDate) as { sum: number };
    return row.sum;
  }

  sumCostByWorkspaceAndProvider(): Array<{ workspace: string; provider: string; totalUsd: number }> {
    const rows = this.db
      .prepare(
        `SELECT t.repo_owner, t.repo_name, ar.provider, SUM(ar.total_cost_usd) as total_usd
         FROM agent_runs ar
         JOIN threads t ON ar.thread_id = t.id
         WHERE ar.total_cost_usd IS NOT NULL
         GROUP BY t.repo_owner, t.repo_name, ar.provider
         ORDER BY total_usd DESC`
      )
      .all() as Array<{ repo_owner: string; repo_name: string; provider: string | null; total_usd: number }>;

    return rows.map((r) => ({
      workspace: `${r.repo_owner}/${r.repo_name}`,
      provider: r.provider || 'unknown',
      totalUsd: r.total_usd,
    }));
  }

  listActive(): Array<AgentRun & { issueNumber: number }> {
    const rows = this.db
      .prepare(
        `SELECT ar.*, t.issue_number AS issue_number_alias
         FROM agent_runs ar
         JOIN threads t ON ar.thread_id = t.id
         WHERE ar.status IN ${ACTIVE_STATUSES}
         ORDER BY ar.id`,
      )
      .all() as Array<AgentRunRow & { issue_number_alias: number }>;
    return rows.map((row) => ({
      ...rowToAgentRun(row),
      issueNumber: row.issue_number_alias,
    }));
  }

  listActiveForRepo(repoOwner: string, repoName: string): Array<AgentRun & { issueNumber: number }> {
    const rows = this.db
      .prepare(
        `SELECT ar.*, t.issue_number AS issue_number_alias
         FROM agent_runs ar
         JOIN threads t ON ar.thread_id = t.id
         WHERE t.repo_owner = ? AND t.repo_name = ?
           AND ar.status IN ${ACTIVE_STATUSES}
         ORDER BY ar.id`,
      )
      .all(repoOwner, repoName) as Array<AgentRunRow & { issue_number_alias: number }>;
    return rows.map((row) => ({
      ...rowToAgentRun(row),
      issueNumber: row.issue_number_alias,
    }));
  }

  /**
   * Rollup over (persona_id, model, provider) for the analytics dashboard.
   * Filters out runs without a persona (non-autopilot dispatches and chat runs)
   * since the comparison only makes sense for autopilot-driven work.
   */
  personaModelRollup(opts: {
    repoOwner?: string;
    repoName?: string;
    sinceTs?: string;
    cardKind?: string;
    cardSizeBucket?: string;
  } = {}): Array<{
    personaId: string;
    model: string | null;
    provider: string | null;
    runs: number;
    successes: number;
    failures: number;
    totalCostUsd: number;
    avgCostUsd: number;
    avgDurationMs: number | null;
    successRate: number;
  }> {
    const where: string[] = ['ar.persona_id IS NOT NULL'];
    const params: unknown[] = [];
    if (opts.repoOwner && opts.repoName) {
      where.push('t.repo_owner = ?');
      where.push('t.repo_name = ?');
      params.push(opts.repoOwner, opts.repoName);
    }
    if (opts.sinceTs) {
      where.push('ar.started_at >= ?');
      params.push(opts.sinceTs);
    }
    if (opts.cardKind) {
      where.push('ar.card_kind = ?');
      params.push(opts.cardKind);
    }
    if (opts.cardSizeBucket) {
      where.push('ar.card_size_bucket = ?');
      params.push(opts.cardSizeBucket);
    }
    const rows = this.db
      .prepare(
        `SELECT
          ar.persona_id,
          ar.model,
          ar.provider,
          COUNT(*) AS runs,
          SUM(CASE WHEN ar.success_signal IN ('promoted','completed_clean') THEN 1 ELSE 0 END) AS successes,
          SUM(CASE WHEN ar.success_signal IN ('failed','stopped','aborted_budget') THEN 1 ELSE 0 END) AS failures,
          COALESCE(SUM(ar.total_cost_usd), 0) AS total_cost_usd,
          COALESCE(AVG(ar.total_cost_usd), 0) AS avg_cost_usd,
          AVG(ar.duration_ms) AS avg_duration_ms
         FROM agent_runs ar
         JOIN threads t ON ar.thread_id = t.id
         WHERE ${where.join(' AND ')}
         GROUP BY ar.persona_id, ar.model, ar.provider
         ORDER BY runs DESC, total_cost_usd DESC`,
      )
      .all(...params) as Array<{
        persona_id: string;
        model: string | null;
        provider: string | null;
        runs: number;
        successes: number;
        failures: number;
        total_cost_usd: number;
        avg_cost_usd: number;
        avg_duration_ms: number | null;
      }>;

    return rows.map((r) => ({
      personaId: r.persona_id,
      model: r.model,
      provider: r.provider,
      runs: r.runs,
      successes: r.successes,
      failures: r.failures,
      totalCostUsd: r.total_cost_usd,
      avgCostUsd: r.avg_cost_usd,
      avgDurationMs: r.avg_duration_ms,
      successRate: r.runs > 0 ? r.successes / r.runs : 0,
    }));
  }

  /**
   * Daily-bucketed cost / count time series. SQLite's strftime is sufficient
   * for our scale; if rollup tables become a bottleneck we'll materialise.
   */
  costTimeSeries(opts: {
    repoOwner?: string;
    repoName?: string;
    sinceTs: string;
    personaId?: string;
    model?: string;
  }): Array<{ bucketDate: string; runs: number; totalCostUsd: number; successRate: number }> {
    const where: string[] = ['ar.started_at >= ?'];
    const params: unknown[] = [opts.sinceTs];
    if (opts.repoOwner && opts.repoName) {
      where.push('t.repo_owner = ?');
      where.push('t.repo_name = ?');
      params.push(opts.repoOwner, opts.repoName);
    }
    if (opts.personaId) {
      where.push('ar.persona_id = ?');
      params.push(opts.personaId);
    }
    if (opts.model) {
      where.push('ar.model = ?');
      params.push(opts.model);
    }
    const rows = this.db
      .prepare(
        `SELECT
          strftime('%Y-%m-%d', ar.started_at) AS bucket_date,
          COUNT(*) AS runs,
          COALESCE(SUM(ar.total_cost_usd), 0) AS total_cost_usd,
          SUM(CASE WHEN ar.success_signal IN ('promoted','completed_clean') THEN 1 ELSE 0 END) AS successes
         FROM agent_runs ar
         JOIN threads t ON ar.thread_id = t.id
         WHERE ${where.join(' AND ')}
         GROUP BY bucket_date
         ORDER BY bucket_date ASC`,
      )
      .all(...params) as Array<{
        bucket_date: string;
        runs: number;
        total_cost_usd: number;
        successes: number;
      }>;
    return rows.map((r) => ({
      bucketDate: r.bucket_date,
      runs: r.runs,
      totalCostUsd: r.total_cost_usd,
      successRate: r.runs > 0 ? r.successes / r.runs : 0,
    }));
  }

  /**
   * Pareto-frontier-ready data for a scatter plot of (avg cost, success rate)
   * across persona × model. Same scope as personaModelRollup but filters out
   * combos with too few runs to be meaningful.
   */
  frontierData(opts: {
    repoOwner?: string;
    repoName?: string;
    sinceTs?: string;
    minRuns?: number;
  } = {}): Array<{
    personaId: string;
    model: string | null;
    provider: string | null;
    runs: number;
    avgCostUsd: number;
    successRate: number;
  }> {
    const minRuns = opts.minRuns ?? 5;
    const rollup = this.personaModelRollup(opts);
    return rollup
      .filter((r) => r.runs >= minRuns)
      .map((r) => ({
        personaId: r.personaId,
        model: r.model,
        provider: r.provider,
        runs: r.runs,
        avgCostUsd: r.avgCostUsd,
        successRate: r.successRate,
      }));
  }

  /**
   * Returns Beta(α, β) priors per (persona × model) for Thompson-sampling
   * routing. α = successes + 1, β = failures + 1. Filtered by card-kind /
   * size when specified — that's the primary axis of routing decisions.
   */
  routerCandidates(opts: {
    repoOwner?: string;
    repoName?: string;
    cardKind?: string;
    cardSizeBucket?: string;
  } = {}): Array<{
    personaId: string;
    model: string | null;
    provider: string | null;
    alpha: number;
    beta: number;
    avgCostUsd: number;
    runs: number;
  }> {
    const rollup = this.personaModelRollup(opts);
    return rollup.map((r) => ({
      personaId: r.personaId,
      model: r.model,
      provider: r.provider,
      alpha: r.successes + 1,
      beta: r.failures + 1,
      avgCostUsd: r.avgCostUsd,
      runs: r.runs,
    }));
  }
}
