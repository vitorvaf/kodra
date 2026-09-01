import type { Db } from '../db.js';
import type { AgentCheck, AgentRunId, CheckKind, CheckStatus } from '../types.js';

interface AgentCheckRow {
  id: number;
  agent_run_id: number;
  kind: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary: string | null;
}

function rowToCheck(row: AgentCheckRow): AgentCheck {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    kind: row.kind as CheckKind,
    status: row.status as CheckStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    summary: row.summary,
  };
}

export interface StartCheckInput {
  agentRunId: AgentRunId;
  kind: CheckKind;
}

export interface FinishCheckInput {
  id: number;
  status: 'pass' | 'fail';
  summary?: string;
}

export class AgentChecksRepo {
  constructor(private readonly db: Db) {}

  start(input: StartCheckInput): AgentCheck {
    const startedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO agent_checks (agent_run_id, kind, status, started_at)
         VALUES (?, ?, 'running', ?)`,
      )
      .run(input.agentRunId, input.kind, startedAt);
    return {
      id: Number(result.lastInsertRowid),
      agentRunId: input.agentRunId,
      kind: input.kind,
      status: 'running',
      startedAt,
      finishedAt: null,
      summary: null,
    };
  }

  finish(input: FinishCheckInput): AgentCheck {
    const finishedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE agent_checks SET status = ?, finished_at = ?, summary = ? WHERE id = ?`,
      )
      .run(input.status, finishedAt, input.summary ?? null, input.id);
    const row = this.db.prepare('SELECT * FROM agent_checks WHERE id = ?').get(input.id) as
      | AgentCheckRow
      | undefined;
    if (!row) throw new Error(`AgentCheck ${input.id} not found`);
    return rowToCheck(row);
  }

  listLatestByRun(agentRunId: AgentRunId): AgentCheck[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM agent_checks c
         JOIN (
           SELECT agent_run_id, kind, MAX(id) AS max_id
           FROM agent_checks
           WHERE agent_run_id = ?
           GROUP BY kind
         ) latest
           ON c.id = latest.max_id`,
      )
      .all(agentRunId) as AgentCheckRow[];
    return rows.map(rowToCheck);
  }

  findLatestByRunsAndKinds(
    runIds: readonly AgentRunId[],
  ): Map<AgentRunId, Map<CheckKind, AgentCheck>> {
    const out = new Map<AgentRunId, Map<CheckKind, AgentCheck>>();
    if (runIds.length === 0) return out;
    const placeholders = runIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT c.* FROM agent_checks c
         JOIN (
           SELECT agent_run_id, kind, MAX(id) AS max_id
           FROM agent_checks
           WHERE agent_run_id IN (${placeholders})
           GROUP BY agent_run_id, kind
         ) latest
           ON c.id = latest.max_id`,
      )
      .all(...runIds) as AgentCheckRow[];
    for (const row of rows) {
      const check = rowToCheck(row);
      if (!out.has(check.agentRunId)) out.set(check.agentRunId, new Map());
      out.get(check.agentRunId)!.set(check.kind, check);
    }
    return out;
  }
}
