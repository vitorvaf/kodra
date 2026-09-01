import type { Migration } from './types.js';

// Multi-session chats: each chat_conversation can now have N parallel
// chat_sessions, each with its own agent_provider/model selection and
// independent lifecycle (idle / running / awaiting_input / completed /
// failed). Messages and agent_runs gain a nullable `session_id` so
// existing rows backfill cleanly into a synthesised first session per
// conversation.
//
// Session lifecycle:
//   - `status` mirrors the most recent agent_run's status for that session
//     and is updated by the supervisor via setStatus().
//   - `title` is auto-derived from the first user message but can be
//     manually renamed; NULL means "Latest" (the default-display label).
//   - Backfill walks every existing chat_conversation and creates one
//     session whose `created_at` matches the conversation, then re-points
//     every message + agent_run that belongs to that conversation's
//     thread to the new session.
export const migration: Migration = {
  id: '0027_chat_sessions',
  up: `
    CREATE TABLE chat_sessions (
      id INTEGER PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id),
      agent_provider TEXT NOT NULL,
      agent_model TEXT,
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT,
      status TEXT NOT NULL DEFAULT 'idle'
    );

    CREATE INDEX idx_chat_sessions_conversation
      ON chat_sessions(conversation_id, last_message_at DESC);

    ALTER TABLE messages ADD COLUMN chat_session_id INTEGER REFERENCES chat_sessions(id);
    -- chat_session_id (not session_id) because agent_runs already has a
    -- session_id TEXT column from 0002 carrying the dispatcher stream
    -- resume token. The two columns serve different purposes and must
    -- coexist, so the chat-session FK keeps its own prefix.
    ALTER TABLE agent_runs ADD COLUMN chat_session_id INTEGER REFERENCES chat_sessions(id);

    CREATE INDEX idx_messages_chat_session ON messages(chat_session_id);
    CREATE INDEX idx_agent_runs_chat_session ON agent_runs(chat_session_id);

    -- Backfill: synthesize one session per existing chat_conversation, then
    -- re-point messages and agent_runs that live on the conversation's
    -- thread to that new session. Provider defaults to 'claude-code' since
    -- existing chats predate per-session provider selection; the user can
    -- create a new session on a different agent at any time.
    INSERT INTO chat_sessions
      (conversation_id, agent_provider, agent_model, title, created_at, updated_at, last_message_at, status)
    SELECT
      cc.id,
      'claude-code',
      NULL,
      NULL,
      cc.created_at,
      cc.last_message_at,
      cc.last_message_at,
      'idle'
    FROM chat_conversations cc;

    UPDATE messages
      SET chat_session_id = (
        SELECT cs.id FROM chat_sessions cs
        JOIN chat_conversations cc ON cc.id = cs.conversation_id
        WHERE cc.thread_id = messages.thread_id
        LIMIT 1
      )
      WHERE chat_session_id IS NULL
        AND thread_id IN (SELECT thread_id FROM chat_conversations WHERE thread_id IS NOT NULL);

    UPDATE agent_runs
      SET chat_session_id = (
        SELECT cs.id FROM chat_sessions cs
        JOIN chat_conversations cc ON cc.id = cs.conversation_id
        WHERE cc.thread_id = agent_runs.thread_id
        LIMIT 1
      )
      WHERE chat_session_id IS NULL
        AND thread_id IN (SELECT thread_id FROM chat_conversations WHERE thread_id IS NOT NULL);
  `,
};
