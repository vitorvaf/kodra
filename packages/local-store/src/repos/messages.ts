import type { Db } from '../db.js';
import type {
  AgentRunId,
  ChatSessionId,
  Message,
  MessageId,
  Role,
  ThreadId,
} from '../types.js';

interface MessageRow {
  id: number;
  thread_id: number;
  role: string;
  body: string;
  created_at: string;
  agent_run_id: number | null;
  promoted_github_comment_id: number | null;
  promoted_at: string | null;
  chat_session_id: number | null;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role as Role,
    body: row.body,
    createdAt: row.created_at,
    agentRunId: row.agent_run_id,
    promotedGithubCommentId: row.promoted_github_comment_id,
    promotedAt: row.promoted_at,
    chatSessionId: row.chat_session_id,
  };
}

export interface CreateMessageInput {
  threadId: ThreadId;
  role: Role;
  body: string;
  agentRunId?: AgentRunId;
  /** When set, the message is scoped to a chat session and shows only
   *  when that session is the active filter. */
  chatSessionId?: ChatSessionId | null;
}

export class MessagesRepo {
  constructor(private readonly db: Db) {}

  create(input: CreateMessageInput): Message {
    const createdAt = new Date().toISOString();
    const agentRunId = input.agentRunId ?? null;
    const chatSessionId = input.chatSessionId ?? null;
    const result = this.db
      .prepare(
        `INSERT INTO messages (thread_id, role, body, created_at, agent_run_id, chat_session_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.threadId, input.role, input.body, createdAt, agentRunId, chatSessionId);
    return {
      id: Number(result.lastInsertRowid),
      threadId: input.threadId,
      role: input.role,
      body: input.body,
      createdAt,
      agentRunId,
      promotedGithubCommentId: null,
      promotedAt: null,
      chatSessionId,
    };
  }

  list(threadId: ThreadId): Message[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY id')
      .all(threadId) as MessageRow[];
    return rows.map(rowToMessage);
  }

  /** Same as `list` but filters to a single chat session. */
  listBySession(sessionId: ChatSessionId): Message[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE chat_session_id = ? ORDER BY id')
      .all(sessionId) as MessageRow[];
    return rows.map(rowToMessage);
  }

  findById(id: MessageId): Message | null {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
      | MessageRow
      | undefined;
    return row ? rowToMessage(row) : null;
  }

  markPromoted(id: MessageId, githubCommentId: number): Message {
    const promotedAt = new Date().toISOString();
    this.db
      .prepare('UPDATE messages SET promoted_github_comment_id = ?, promoted_at = ? WHERE id = ?')
      .run(githubCommentId, promotedAt, id);
    const m = this.findById(id);
    if (!m) throw new Error(`Message ${id} not found`);
    return m;
  }
}
