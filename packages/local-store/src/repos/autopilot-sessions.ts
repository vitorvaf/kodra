import type { Db } from '../db.js';
import type {
  AutopilotChildEntry,
  AutopilotConfig,
  AutopilotKind,
  AutopilotSession,
  AutopilotStatus,
} from '../types.js';

interface AutopilotSessionRow {
  id: number;
  issue_number: number;
  kind: string;
  config: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  stop_reason: string | null;
  cycle_index: number;
  current_child_run_id: number | null;
  children_json: string;
}

function rowToSession(row: AutopilotSessionRow): AutopilotSession {
  return {
    id: row.id,
    issueNumber: row.issue_number,
    kind: row.kind as AutopilotKind,
    config: JSON.parse(row.config) as AutopilotConfig,
    status: row.status as AutopilotStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    stopReason: row.stop_reason,
    cycleIndex: row.cycle_index,
    currentChildRunId: row.current_child_run_id,
    children: JSON.parse(row.children_json) as AutopilotChildEntry[],
  };
}

export interface CreateAutopilotSessionInput {
  issueNumber: number;
  kind: AutopilotKind;
  config: AutopilotConfig;
}

export interface UpdateAutopilotSessionPatch {
  status?: AutopilotStatus;
  endedAt?: string | null;
  stopReason?: string | null;
  cycleIndex?: number;
  currentChildRunId?: number | null;
}

const PATCH_COLUMNS: Record<keyof UpdateAutopilotSessionPatch, string> = {
  status: 'status',
  endedAt: 'ended_at',
  stopReason: 'stop_reason',
  cycleIndex: 'cycle_index',
  currentChildRunId: 'current_child_run_id',
};

const ACTIVE_STATUS = "'running'";

export class AutopilotSessionsRepo {
  constructor(private readonly db: Db) {}

  create(input: CreateAutopilotSessionInput): AutopilotSession {
    const startedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO autopilot_sessions
         (issue_number, kind, config, status, started_at, cycle_index, children_json)
         VALUES (?, ?, ?, 'running', ?, 0, '[]')`,
      )
      .run(input.issueNumber, input.kind, JSON.stringify(input.config), startedAt);
    const id = Number(result.lastInsertRowid);
    return {
      id,
      issueNumber: input.issueNumber,
      kind: input.kind,
      config: input.config,
      status: 'running',
      startedAt,
      endedAt: null,
      stopReason: null,
      cycleIndex: 0,
      currentChildRunId: null,
      children: [],
    };
  }

  update(id: number, patch: UpdateAutopilotSessionPatch): AutopilotSession {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as (keyof UpdateAutopilotSessionPatch)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      fields.push(`${PATCH_COLUMNS[key]} = ?`);
      values.push(value);
    }
    if (fields.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE autopilot_sessions SET ${fields.join(', ')} WHERE id = ?`)
        .run(...values);
    }
    const session = this.findById(id);
    if (!session) throw new Error(`AutopilotSession ${id} not found`);
    return session;
  }

  findById(id: number): AutopilotSession | null {
    const row = this.db
      .prepare('SELECT * FROM autopilot_sessions WHERE id = ?')
      .get(id) as AutopilotSessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  findByIssueNumber(issueNumber: number): AutopilotSession | null {
    const row = this.db
      .prepare(
        'SELECT * FROM autopilot_sessions WHERE issue_number = ? ORDER BY id DESC LIMIT 1',
      )
      .get(issueNumber) as AutopilotSessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  listActive(): AutopilotSession[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM autopilot_sessions WHERE status IN (${ACTIVE_STATUS}) ORDER BY id`,
      )
      .all() as AutopilotSessionRow[];
    return rows.map(rowToSession);
  }

  appendChild(id: number, child: AutopilotChildEntry): AutopilotSession {
    const session = this.findById(id);
    if (!session) throw new Error(`AutopilotSession ${id} not found`);
    const next = [...session.children, child];
    this.db
      .prepare('UPDATE autopilot_sessions SET children_json = ? WHERE id = ?')
      .run(JSON.stringify(next), id);
    return { ...session, children: next };
  }

  updateChildByIssueNumber(
    id: number,
    issueNumber: number,
    patch: Partial<AutopilotChildEntry>,
  ): AutopilotSession {
    const session = this.findById(id);
    if (!session) throw new Error(`AutopilotSession ${id} not found`);
    const next = session.children.map((c) =>
      c.issueNumber === issueNumber ? { ...c, ...patch } : c,
    );
    this.db
      .prepare('UPDATE autopilot_sessions SET children_json = ? WHERE id = ?')
      .run(JSON.stringify(next), id);
    return { ...session, children: next };
  }

  markRunningAsInterrupted(reason: string): AutopilotSession[] {
    const rows = this.db
      .prepare(`SELECT * FROM autopilot_sessions WHERE status IN (${ACTIVE_STATUS})`)
      .all() as AutopilotSessionRow[];
    if (rows.length === 0) return [];
    const endedAt = new Date().toISOString();
    const update = this.db.prepare(
      `UPDATE autopilot_sessions SET status = 'stopped', ended_at = ?, stop_reason = ? WHERE id = ?`,
    );
    const txn = this.db.transaction((ids: number[]) => {
      for (const rowId of ids) update.run(endedAt, reason, rowId);
    });
    txn(rows.map((r) => r.id));
    return rows.map((r) => ({
      ...rowToSession(r),
      status: 'stopped',
      endedAt,
      stopReason: reason,
    }));
  }
}
