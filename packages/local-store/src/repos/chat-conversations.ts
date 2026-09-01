import type { Db } from '../db.js';
import type {
  ChatConversation,
  ChatConversationId,
  ThreadId,
} from '../types.js';

export const CHAT_REPO_OWNER = '__chat__';
export const CHAT_REPO_NAME = '__chat__';

interface ChatConversationRow {
  id: number;
  title: string;
  created_at: string;
  last_message_at: string;
  thread_id: number;
}

function rowTo(row: ChatConversationRow): ChatConversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    threadId: row.thread_id,
  };
}

export interface CreateChatConversationInput {
  title: string;
}

export class ChatConversationsRepo {
  constructor(private readonly db: Db) {}

  /**
   * Create a chat conversation along with its underlying thread row. The
   * thread is keyed off the chat-only sentinel owner/name and the
   * conversation id, so it never collides with a real issue thread and the
   * supervisor's per-thread invariants (one active run per thread) carry
   * over to chat conversations unchanged. The chat row is inserted with a
   * NULL thread_id first so the FK to threads(id) doesn't fail before the
   * thread row exists.
   */
  create(input: CreateChatConversationInput): ChatConversation {
    const now = new Date().toISOString();
    return this.db.transaction(() => {
      const convInsert = this.db
        .prepare(
          `INSERT INTO chat_conversations (title, created_at, last_message_at, thread_id)
           VALUES (?, ?, ?, NULL)`,
        )
        .run(input.title, now, now);
      const conversationId = Number(convInsert.lastInsertRowid);
      const threadInsert = this.db
        .prepare(
          `INSERT INTO threads (repo_owner, repo_name, issue_number, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(CHAT_REPO_OWNER, CHAT_REPO_NAME, conversationId, now);
      const threadId = Number(threadInsert.lastInsertRowid);
      this.db
        .prepare('UPDATE chat_conversations SET thread_id = ? WHERE id = ?')
        .run(threadId, conversationId);
      return {
        id: conversationId,
        title: input.title,
        createdAt: now,
        lastMessageAt: now,
        threadId,
      };
    })();
  }

  findById(id: ChatConversationId): ChatConversation | null {
    const row = this.db
      .prepare('SELECT * FROM chat_conversations WHERE id = ?')
      .get(id) as ChatConversationRow | undefined;
    return row ? rowTo(row) : null;
  }

  findByThreadId(threadId: ThreadId): ChatConversation | null {
    const row = this.db
      .prepare('SELECT * FROM chat_conversations WHERE thread_id = ?')
      .get(threadId) as ChatConversationRow | undefined;
    return row ? rowTo(row) : null;
  }

  list(): ChatConversation[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM chat_conversations ORDER BY last_message_at DESC, id DESC',
      )
      .all() as ChatConversationRow[];
    return rows.map(rowTo);
  }

  rename(id: ChatConversationId, title: string): ChatConversation {
    this.db
      .prepare('UPDATE chat_conversations SET title = ? WHERE id = ?')
      .run(title, id);
    const c = this.findById(id);
    if (!c) throw new Error(`chat conversation ${id} not found`);
    return c;
  }

  touch(id: ChatConversationId): void {
    this.db
      .prepare('UPDATE chat_conversations SET last_message_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
  }

  delete(id: ChatConversationId): void {
    const conv = this.findById(id);
    if (!conv) return;
    this.db.transaction(() => {
      const messageIds = (
        this.db
          .prepare('SELECT id FROM messages WHERE thread_id = ?')
          .all(conv.threadId) as Array<{ id: number }>
      ).map((r) => r.id);
      const runIds = (
        this.db
          .prepare('SELECT id FROM agent_runs WHERE thread_id = ?')
          .all(conv.threadId) as Array<{ id: number }>
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
      this.db.prepare('DELETE FROM messages WHERE thread_id = ?').run(conv.threadId);
      this.db.prepare('DELETE FROM agent_runs WHERE thread_id = ?').run(conv.threadId);
      // Drop dependent chat_sessions rows after their messages/runs are gone
      // — FK constraint on chat_sessions(conversation_id) would otherwise
      // block the conversation delete.
      this.db.prepare('DELETE FROM chat_sessions WHERE conversation_id = ?').run(id);
      this.db.prepare('DELETE FROM chat_conversations WHERE id = ?').run(id);
      this.db.prepare('DELETE FROM threads WHERE id = ?').run(conv.threadId);
    })();
  }
}
