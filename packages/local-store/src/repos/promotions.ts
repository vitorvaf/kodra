import type { Db } from '../db.js';
import type { CardId, MessageId, Promotion, PromotionId, PromotionKind } from '../types.js';

interface PromotionRow {
  id: number;
  card_id: number | null;
  message_id: number | null;
  kind: string;
  github_id: number;
  created_at: string;
}

function rowToPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    cardId: row.card_id,
    messageId: row.message_id,
    kind: row.kind as PromotionKind,
    githubId: row.github_id,
    createdAt: row.created_at,
  };
}

export interface CreatePromotionInput {
  kind: PromotionKind;
  githubId: number;
  cardId?: CardId;
  messageId?: MessageId;
}

export class PromotionsRepo {
  constructor(private readonly db: Db) {}

  create(input: CreatePromotionInput): Promotion {
    const createdAt = new Date().toISOString();
    const cardId = input.cardId ?? null;
    const messageId = input.messageId ?? null;
    const result = this.db
      .prepare(
        `INSERT INTO promotions (card_id, message_id, kind, github_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(cardId, messageId, input.kind, input.githubId, createdAt);
    return {
      id: Number(result.lastInsertRowid),
      cardId,
      messageId,
      kind: input.kind,
      githubId: input.githubId,
      createdAt,
    };
  }

  findById(id: PromotionId): Promotion | null {
    const row = this.db.prepare('SELECT * FROM promotions WHERE id = ?').get(id) as
      | PromotionRow
      | undefined;
    return row ? rowToPromotion(row) : null;
  }

  findByMessage(messageId: MessageId): Promotion | null {
    const row = this.db
      .prepare('SELECT * FROM promotions WHERE message_id = ? ORDER BY id DESC LIMIT 1')
      .get(messageId) as PromotionRow | undefined;
    return row ? rowToPromotion(row) : null;
  }

  findByCard(cardId: CardId): Promotion | null {
    const row = this.db
      .prepare('SELECT * FROM promotions WHERE card_id = ? ORDER BY id DESC LIMIT 1')
      .get(cardId) as PromotionRow | undefined;
    return row ? rowToPromotion(row) : null;
  }
}
