import type { Db } from '../db.js';
import type { AgentRunId, Card, CardId, CardStatus, CardType, MessageId } from '../types.js';

export class CardAlreadyResolvedError extends Error {
  constructor(
    public readonly cardId: CardId,
    public readonly status: CardStatus,
  ) {
    super(`Card ${cardId} cannot be resolved (status: ${status})`);
    this.name = 'CardAlreadyResolvedError';
  }
}

interface CardRow {
  id: number;
  message_id: number;
  type: string;
  payload: string;
  status: string;
  resolved_value: string | null;
  resolved_at: string | null;
}

function rowToCard(row: CardRow): Card {
  return {
    id: row.id,
    messageId: row.message_id,
    type: row.type as CardType,
    payload: JSON.parse(row.payload) as unknown,
    status: row.status as CardStatus,
    resolvedValue: row.resolved_value === null ? null : (JSON.parse(row.resolved_value) as unknown),
    resolvedAt: row.resolved_at,
  };
}

export interface CreateCardInput {
  messageId: MessageId;
  type: CardType;
  payload: unknown;
}

export class CardsRepo {
  constructor(private readonly db: Db) {}

  create(input: CreateCardInput): Card {
    const result = this.db
      .prepare('INSERT INTO cards (message_id, type, payload, status) VALUES (?, ?, ?, ?)')
      .run(input.messageId, input.type, JSON.stringify(input.payload), 'pending');
    return {
      id: Number(result.lastInsertRowid),
      messageId: input.messageId,
      type: input.type,
      payload: input.payload,
      status: 'pending',
      resolvedValue: null,
      resolvedAt: null,
    };
  }

  resolve(id: CardId, value: unknown): Card {
    const resolvedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE cards SET status = 'resolved', resolved_value = ?, resolved_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(JSON.stringify(value), resolvedAt, id);

    if (result.changes === 0) {
      const existing = this.findById(id);
      if (!existing) throw new Error(`Card ${id} not found`);
      throw new CardAlreadyResolvedError(id, existing.status);
    }

    const card = this.findById(id);
    if (!card) throw new Error(`Card ${id} not found`);
    return card;
  }

  dismiss(id: CardId): Card {
    this.db.prepare("UPDATE cards SET status = 'dismissed' WHERE id = ?").run(id);
    const card = this.findById(id);
    if (!card) throw new Error(`Card ${id} not found`);
    return card;
  }

  findById(id: CardId): Card | null {
    const row = this.db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as CardRow | undefined;
    return row ? rowToCard(row) : null;
  }

  listByMessage(messageId: MessageId): Card[] {
    const rows = this.db
      .prepare('SELECT * FROM cards WHERE message_id = ? ORDER BY id')
      .all(messageId) as CardRow[];
    return rows.map(rowToCard);
  }

  listByRun(agentRunId: AgentRunId): Card[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM cards c
         JOIN messages m ON c.message_id = m.id
         WHERE m.agent_run_id = ?
         ORDER BY c.id`,
      )
      .all(agentRunId) as CardRow[];
    return rows.map(rowToCard);
  }

  listByThread(threadId: number): Card[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM cards c
         JOIN messages m ON c.message_id = m.id
         WHERE m.thread_id = ?
         ORDER BY c.id`,
      )
      .all(threadId) as CardRow[];
    return rows.map(rowToCard);
  }

  findPendingByRuns(runIds: readonly AgentRunId[]): Map<AgentRunId, Card> {
    const out = new Map<AgentRunId, Card>();
    if (runIds.length === 0) return out;
    const placeholders = runIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT c.*, m.agent_run_id AS run_id_alias FROM cards c
         JOIN messages m ON c.message_id = m.id
         WHERE m.agent_run_id IN (${placeholders})
           AND c.status = 'pending'
         ORDER BY c.id`,
      )
      .all(...runIds) as Array<CardRow & { run_id_alias: number }>;
    for (const row of rows) {
      // First-pending-wins per run.
      if (!out.has(row.run_id_alias)) out.set(row.run_id_alias, rowToCard(row));
    }
    return out;
  }

  listAllPending(): Array<{ card: Card; agentRunId: AgentRunId }> {
    const rows = this.db
      .prepare(
        `SELECT c.*, m.agent_run_id AS run_id_alias FROM cards c
         JOIN messages m ON c.message_id = m.id
         WHERE c.status = 'pending'
         ORDER BY c.id`,
      )
      .all() as Array<CardRow & { run_id_alias: number }>;
    return rows.map((row) => ({ card: rowToCard(row), agentRunId: row.run_id_alias }));
  }

  listPendingForRepo(
    repoOwner: string,
    repoName: string,
  ): Array<{ card: Card; agentRunId: AgentRunId; issueNumber: number }> {
    const rows = this.db
      .prepare(
        `SELECT c.*,
                m.agent_run_id AS run_id_alias,
                t.issue_number AS issue_number_alias
         FROM cards c
         JOIN messages m ON c.message_id = m.id
         JOIN agent_runs ar ON m.agent_run_id = ar.id
         JOIN threads t ON ar.thread_id = t.id
         WHERE t.repo_owner = ? AND t.repo_name = ?
           AND c.status = 'pending' AND c.type = 'decision'
           AND ar.status = 'awaiting_input'
         ORDER BY c.id`,
      )
      .all(repoOwner, repoName) as Array<
        CardRow & { run_id_alias: number; issue_number_alias: number }
      >;
    return rows.map((row) => ({
      card: rowToCard(row),
      agentRunId: row.run_id_alias,
      issueNumber: row.issue_number_alias,
    }));
  }

  dismissPendingDecisionsForRun(agentRunId: AgentRunId): number {
    const result = this.db
      .prepare(
        `UPDATE cards SET status = 'dismissed'
         WHERE id IN (
           SELECT c.id FROM cards c
           JOIN messages m ON c.message_id = m.id
           WHERE m.agent_run_id = ?
             AND c.status = 'pending'
             AND c.type = 'decision'
         )`,
      )
      .run(agentRunId);
    return result.changes;
  }

  dismissOrphanPendingDecisions(): number {
    const result = this.db
      .prepare(
        `UPDATE cards SET status = 'dismissed'
         WHERE id IN (
           SELECT c.id FROM cards c
           JOIN messages m ON c.message_id = m.id
           JOIN agent_runs ar ON m.agent_run_id = ar.id
           WHERE c.status = 'pending'
             AND c.type = 'decision'
             AND ar.status NOT IN ('starting', 'running', 'awaiting_input')
         )`,
      )
      .run();
    return result.changes;
  }
}
