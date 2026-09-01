import type { Db } from '../db.js';
import type {
  ChatConversationId,
  ChatSession,
  ChatSessionId,
  ChatSessionStatus,
  ProviderId,
  ThreadId,
} from '../types.js';

interface ChatSessionRow {
  id: number;
  conversation_id: number | null;
  thread_id: number | null;
  agent_provider: string;
  agent_model: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  status: string;
}

function rowToSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    threadId: row.thread_id,
    agentProvider: row.agent_provider as ProviderId,
    agentModel: row.agent_model,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    status: row.status as ChatSessionStatus,
  };
}

/**
 * Mutually-exclusive create input — a session belongs to either a chat
 * conversation (standalone chat surface) or an issue thread, never both.
 * The discriminated union surfaces the constraint at the type level so
 * callers can't accidentally hand us a half-formed scope.
 */
export type CreateChatSessionInput =
  | {
      conversationId: ChatConversationId;
      threadId?: never;
      agentProvider: ProviderId;
      agentModel?: string | null;
      title?: string | null;
    }
  | {
      conversationId?: never;
      threadId: ThreadId;
      agentProvider: ProviderId;
      agentModel?: string | null;
      title?: string | null;
    };

/**
 * One agent thread within a chat conversation or an issue. A conversation
 * (or issue thread) can host many parallel sessions — each pins its own
 * provider + model and tracks its own status, so a user can explore in
 * one and build in another without crossing the streams.
 */
export class ChatSessionsRepo {
  constructor(private readonly db: Db) {}

  /**
   * List sessions for a conversation ordered by most-recent activity. We
   * coalesce on created_at so brand-new sessions (last_message_at NULL)
   * still sort sensibly at the top.
   */
  listByConversation(conversationId: ChatConversationId): ChatSession[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM chat_sessions
         WHERE conversation_id = ?
         ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC`,
      )
      .all(conversationId) as ChatSessionRow[];
    return rows.map(rowToSession);
  }

  /**
   * Issue-thread variant of listByConversation. Same ordering semantics —
   * most-recent-first with the created_at fallback so freshly minted
   * sessions surface at the top of the dropdown.
   */
  listByThread(threadId: ThreadId): ChatSession[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM chat_sessions
         WHERE thread_id = ?
         ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC`,
      )
      .all(threadId) as ChatSessionRow[];
    return rows.map(rowToSession);
  }

  findById(id: ChatSessionId): ChatSession | null {
    const row = this.db
      .prepare('SELECT * FROM chat_sessions WHERE id = ?')
      .get(id) as ChatSessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  /** Most recently active session for a conversation, used as the
   *  fallback target when a caller posts a message without specifying a
   *  session id. */
  findMostRecentForConversation(
    conversationId: ChatConversationId,
  ): ChatSession | null {
    const row = this.db
      .prepare(
        `SELECT * FROM chat_sessions
         WHERE conversation_id = ?
         ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
         LIMIT 1`,
      )
      .get(conversationId) as ChatSessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  /** Issue-thread variant. Same fallback semantics as the conversation
   *  case — used by the post-message path when the caller doesn't pin
   *  an explicit session. */
  findMostRecentForThread(threadId: ThreadId): ChatSession | null {
    const row = this.db
      .prepare(
        `SELECT * FROM chat_sessions
         WHERE thread_id = ?
         ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
         LIMIT 1`,
      )
      .get(threadId) as ChatSessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  create(input: CreateChatSessionInput): ChatSession {
    const now = new Date().toISOString();
    const conversationId = input.conversationId ?? null;
    const threadId = input.threadId ?? null;
    if ((conversationId === null) === (threadId === null)) {
      // Belt-and-braces: the discriminated union prevents this at the
      // type level, but a caller using `any` could still slip through.
      throw new Error(
        'chat_sessions.create: exactly one of conversationId/threadId must be set',
      );
    }
    const result = this.db
      .prepare(
        `INSERT INTO chat_sessions
           (conversation_id, thread_id, agent_provider, agent_model, title, created_at, updated_at, last_message_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'idle')`,
      )
      .run(
        conversationId,
        threadId,
        input.agentProvider,
        input.agentModel ?? null,
        input.title ?? null,
        now,
        now,
      );
    return {
      id: Number(result.lastInsertRowid),
      conversationId,
      threadId,
      agentProvider: input.agentProvider,
      agentModel: input.agentModel ?? null,
      title: input.title ?? null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      status: 'idle',
    };
  }

  rename(id: ChatSessionId, title: string | null): ChatSession {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, now, id);
    const session = this.findById(id);
    if (!session) throw new Error(`chat session ${id} not found`);
    return session;
  }

  setStatus(id: ChatSessionId, status: ChatSessionStatus): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE chat_sessions SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id);
  }

  /** Stamp last_message_at + updated_at after a message lands. Called by
   *  the chat post-message handler so the dropdown sort reflects activity. */
  touch(id: ChatSessionId): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        'UPDATE chat_sessions SET last_message_at = ?, updated_at = ? WHERE id = ?',
      )
      .run(now, now, id);
  }

  remove(id: ChatSessionId): void {
    const session = this.findById(id);
    if (!session) return;
    this.db.transaction(() => {
      // Pull message and run ids that belong to this session so we can
      // cascade-clean cards/events/checks/promotions the same way the
      // chat-conversation delete path does.
      const messageIds = (
        this.db
          .prepare('SELECT id FROM messages WHERE chat_session_id = ?')
          .all(id) as Array<{ id: number }>
      ).map((r) => r.id);
      const runIds = (
        this.db
          .prepare('SELECT id FROM agent_runs WHERE chat_session_id = ?')
          .all(id) as Array<{ id: number }>
      ).map((r) => r.id);

      if (messageIds.length > 0) {
        const placeholders = messageIds.map(() => '?').join(',');
        this.db
          .prepare(`DELETE FROM cards WHERE message_id IN (${placeholders})`)
          .run(...messageIds);
        this.db
          .prepare(`DELETE FROM promotions WHERE message_id IN (${placeholders})`)
          .run(...messageIds);
      }
      if (runIds.length > 0) {
        const placeholders = runIds.map(() => '?').join(',');
        this.db
          .prepare(`DELETE FROM agent_events WHERE agent_run_id IN (${placeholders})`)
          .run(...runIds);
        this.db
          .prepare(`DELETE FROM agent_checks WHERE agent_run_id IN (${placeholders})`)
          .run(...runIds);
      }
      this.db.prepare('DELETE FROM messages WHERE chat_session_id = ?').run(id);
      this.db.prepare('DELETE FROM agent_runs WHERE chat_session_id = ?').run(id);
      this.db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
    })();
  }

  /** Cascade delete every session attached to a conversation. Used by
   *  chat-conversations.delete() so the FK chain stays consistent. */
  removeAllForConversation(conversationId: ChatConversationId): void {
    const ids = (
      this.db
        .prepare('SELECT id FROM chat_sessions WHERE conversation_id = ?')
        .all(conversationId) as Array<{ id: number }>
    ).map((r) => r.id);
    for (const id of ids) {
      this.remove(id);
    }
  }
}
