import { createHash } from 'node:crypto';
import type { Db } from '../db.js';
import type {
  AgentRunId,
  CuratorRunState,
  Learning,
  LearningId,
  LearningTag,
} from '../types.js';

interface LearningRow {
  id: number;
  repo_owner: string;
  repo_name: string;
  tag: string;
  content: string;
  content_hash: string;
  source_run_id: number | null;
  confidence: number;
  evidence_event_seq_min: number | null;
  evidence_event_seq_max: number | null;
  embedding: Buffer | null;
  pinned: number;
  use_count: number;
  created_at: string;
  last_used_at: string | null;
  supersedes_id: number | null;
  deleted_at: string | null;
}

function rowToLearning(row: LearningRow): Learning {
  return {
    id: row.id,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    tag: row.tag as LearningTag,
    content: row.content,
    contentHash: row.content_hash,
    sourceRunId: row.source_run_id,
    confidence: row.confidence,
    evidenceEventSeqMin: row.evidence_event_seq_min,
    evidenceEventSeqMax: row.evidence_event_seq_max,
    embedding: row.embedding,
    pinned: row.pinned !== 0,
    useCount: row.use_count,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    supersedesId: row.supersedes_id,
    deletedAt: row.deleted_at,
  };
}

/** Normalise content before hashing so trivial whitespace/case changes don't
 *  produce duplicate-looking learnings. Symmetric with what `upsertWithDedup`
 *  would compute on read. */
export function normaliseLearningContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function hashLearningContent(content: string): string {
  return createHash('sha256').update(normaliseLearningContent(content)).digest('hex');
}

export interface UpsertLearningInput {
  repoOwner: string;
  repoName: string;
  tag: LearningTag;
  content: string;
  sourceRunId?: AgentRunId;
  confidence?: number;
  evidenceEventSeqMin?: number;
  evidenceEventSeqMax?: number;
}

export interface UpsertLearningResult {
  learning: Learning;
  /** True when the row already existed and we just bumped use_count /
   *  refreshed last_used_at, false when a new row was inserted. */
  updated: boolean;
}

export interface ListForInjectionInput {
  repoOwner: string;
  repoName: string;
  /** Approximate token budget — entries are emitted in priority order until
   *  the running total exceeds this. Estimated at 4 chars/token. */
  tokenBudget?: number;
}

const DEFAULT_INJECTION_TOKEN_BUDGET = 1500;

export interface ListAllLearningsInput {
  repoOwner: string;
  repoName: string;
  includeDeleted?: boolean;
  /** Filter to one tag, e.g. for the Repo Brain panel's tag chips. */
  tag?: LearningTag;
  /** Page size for the list view. */
  limit?: number;
}

export class LearningsRepo {
  constructor(private readonly db: Db) {}

  /** Either insert a new learning or, if one already exists with the same
   *  normalised content, increment its use count and refresh `last_used_at`.
   *  Returns the resulting row plus a boolean indicating which path ran. */
  upsertWithDedup(input: UpsertLearningInput): UpsertLearningResult {
    const contentHash = hashLearningContent(input.content);
    const now = new Date().toISOString();
    const existing = this.db
      .prepare(
        `SELECT * FROM learnings
         WHERE repo_owner = ? AND repo_name = ? AND content_hash = ? AND deleted_at IS NULL
         LIMIT 1`,
      )
      .get(input.repoOwner, input.repoName, contentHash) as LearningRow | undefined;
    if (existing) {
      // Bump usage and adopt the higher confidence so corroborating evidence
      // strengthens the entry.
      const newConfidence = Math.max(existing.confidence, input.confidence ?? existing.confidence);
      this.db
        .prepare(
          `UPDATE learnings
           SET use_count = use_count + 1,
               last_used_at = ?,
               confidence = ?
           WHERE id = ?`,
        )
        .run(now, newConfidence, existing.id);
      const updatedRow = this.db
        .prepare('SELECT * FROM learnings WHERE id = ?')
        .get(existing.id) as LearningRow;
      return { learning: rowToLearning(updatedRow), updated: true };
    }

    const result = this.db
      .prepare(
        `INSERT INTO learnings (
          repo_owner, repo_name, tag, content, content_hash, source_run_id,
          confidence, evidence_event_seq_min, evidence_event_seq_max, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.repoOwner,
        input.repoName,
        input.tag,
        input.content,
        contentHash,
        input.sourceRunId ?? null,
        input.confidence ?? 0.5,
        input.evidenceEventSeqMin ?? null,
        input.evidenceEventSeqMax ?? null,
        now,
      );
    const inserted = this.db
      .prepare('SELECT * FROM learnings WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as LearningRow;
    return { learning: rowToLearning(inserted), updated: false };
  }

  /** Retrieve top-N learnings for injection into a system prompt, ordered
   *  by (pinned, confidence × recency_decay, use_count) and truncated to a
   *  token budget. Used by the supervisor's composeSystemPrompt. */
  listForInjection(input: ListForInjectionInput): Learning[] {
    const budget = input.tokenBudget ?? DEFAULT_INJECTION_TOKEN_BUDGET;
    const rows = this.db
      .prepare(
        `SELECT *
         FROM learnings
         WHERE repo_owner = ? AND repo_name = ? AND deleted_at IS NULL
         ORDER BY pinned DESC,
                  -- recency-decayed confidence: recent useful entries beat
                  -- stale high-confidence ones.
                  confidence * EXP(
                    -CAST(
                      (julianday('now') - julianday(COALESCE(last_used_at, created_at)))
                      AS REAL
                    ) / 30.0
                  ) DESC,
                  use_count DESC,
                  id DESC`,
      )
      .all(input.repoOwner, input.repoName) as LearningRow[];

    const out: Learning[] = [];
    let charBudget = budget * 4;
    for (const row of rows) {
      const cost = row.content.length + 16; // tag prefix + framing
      if (cost > charBudget) break;
      charBudget -= cost;
      out.push(rowToLearning(row));
    }
    return out;
  }

  /** Mark these ids as recently used. Called after a run finishes that had
   *  injected the entries — drives the recency-decay ranker. */
  bumpUsage(ids: readonly LearningId[]): void {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(
        `UPDATE learnings
         SET use_count = use_count + 1, last_used_at = ?
         WHERE id IN (${placeholders})`,
      )
      .run(now, ...ids);
  }

  listAll(input: ListAllLearningsInput): Learning[] {
    const limit = input.limit ?? 200;
    const params: unknown[] = [input.repoOwner, input.repoName];
    let where = 'repo_owner = ? AND repo_name = ?';
    if (!input.includeDeleted) where += ' AND deleted_at IS NULL';
    if (input.tag) {
      where += ' AND tag = ?';
      params.push(input.tag);
    }
    params.push(limit);
    const rows = this.db
      .prepare(
        `SELECT * FROM learnings WHERE ${where}
         ORDER BY pinned DESC, last_used_at DESC NULLS LAST, id DESC
         LIMIT ?`,
      )
      .all(...params) as LearningRow[];
    return rows.map(rowToLearning);
  }

  findById(id: LearningId): Learning | null {
    const row = this.db.prepare('SELECT * FROM learnings WHERE id = ?').get(id) as
      | LearningRow
      | undefined;
    return row ? rowToLearning(row) : null;
  }

  pin(id: LearningId, pinned: boolean): Learning {
    this.db
      .prepare('UPDATE learnings SET pinned = ? WHERE id = ?')
      .run(pinned ? 1 : 0, id);
    const row = this.findById(id);
    if (!row) throw new Error(`Learning ${id} not found`);
    return row;
  }

  /** Soft-delete: keeps history but excludes from retrieval and dedup. */
  softDelete(id: LearningId): Learning {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE learnings SET deleted_at = ? WHERE id = ?').run(now, id);
    const row = this.findById(id);
    if (!row) throw new Error(`Learning ${id} not found`);
    return row;
  }

  updateContent(id: LearningId, content: string): Learning {
    const contentHash = hashLearningContent(content);
    this.db
      .prepare('UPDATE learnings SET content = ?, content_hash = ? WHERE id = ?')
      .run(content, contentHash, id);
    const row = this.findById(id);
    if (!row) throw new Error(`Learning ${id} not found`);
    return row;
  }

  /** Curator daily budget tracker. Read at the start of each curator dispatch
   *  to bail early if today's spend has hit the cap. */
  getCuratorState(repoOwner: string, repoName: string): CuratorRunState | null {
    const row = this.db
      .prepare(
        'SELECT * FROM curator_run_state WHERE repo_owner = ? AND repo_name = ?',
      )
      .get(repoOwner, repoName) as
      | {
          repo_owner: string;
          repo_name: string;
          daily_budget_usd: number | null;
          spent_today_usd: number;
          spent_date: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      repoOwner: row.repo_owner,
      repoName: row.repo_name,
      dailyBudgetUsd: row.daily_budget_usd,
      spentTodayUsd: row.spent_today_usd,
      spentDate: row.spent_date,
    };
  }

  /** Atomically attribute curator spend to today, resetting the rolling
   *  window when the date rolls over. Returns the resulting cumulative
   *  spend so callers can decide whether to bail. */
  attributeCuratorSpend(repoOwner: string, repoName: string, costUsd: number): number {
    const today = new Date().toISOString().slice(0, 10);
    const existing = this.getCuratorState(repoOwner, repoName);
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO curator_run_state (
            repo_owner, repo_name, daily_budget_usd, spent_today_usd, spent_date
          ) VALUES (?, ?, NULL, ?, ?)`,
        )
        .run(repoOwner, repoName, costUsd, today);
      return costUsd;
    }
    if (existing.spentDate !== today) {
      this.db
        .prepare(
          `UPDATE curator_run_state SET spent_today_usd = ?, spent_date = ?
           WHERE repo_owner = ? AND repo_name = ?`,
        )
        .run(costUsd, today, repoOwner, repoName);
      return costUsd;
    }
    const next = existing.spentTodayUsd + costUsd;
    this.db
      .prepare(
        `UPDATE curator_run_state SET spent_today_usd = ?
         WHERE repo_owner = ? AND repo_name = ?`,
      )
      .run(next, repoOwner, repoName);
    return next;
  }

  setCuratorDailyBudget(
    repoOwner: string,
    repoName: string,
    dailyBudgetUsd: number | null,
  ): void {
    const existing = this.getCuratorState(repoOwner, repoName);
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO curator_run_state (
            repo_owner, repo_name, daily_budget_usd, spent_today_usd, spent_date
          ) VALUES (?, ?, ?, 0, NULL)`,
        )
        .run(repoOwner, repoName, dailyBudgetUsd);
      return;
    }
    this.db
      .prepare(
        `UPDATE curator_run_state SET daily_budget_usd = ?
         WHERE repo_owner = ? AND repo_name = ?`,
      )
      .run(dailyBudgetUsd, repoOwner, repoName);
  }
}
