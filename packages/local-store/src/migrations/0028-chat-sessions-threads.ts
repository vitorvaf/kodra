import type { Migration } from './types.js';

// Issue-scoped chat sessions: chat_sessions previously pointed only at
// chat_conversations (the standalone chat window). Issue threads have
// their own messages/agent_runs flow keyed by threads.id, and we want
// the same multi-session UX there — one session per parallel agent
// thread, each pinning its own provider/model.
//
// Schema change: add a nullable thread_id FK alongside conversation_id
// and require exactly one of the two to be set. SQLite can't alter a
// NOT NULL column to NULL or add a table-level CHECK in place, so we
// rebuild chat_sessions via the standard 12-step rename pattern.
//
// Backfill: existing rows continue to point at conversation_id with
// thread_id NULL — every prior chat session keeps working.
export const migration: Migration = {
  id: '0028_chat_sessions_threads',
  up: `
    CREATE TABLE chat_sessions_new (
      id INTEGER PRIMARY KEY,
      conversation_id INTEGER REFERENCES chat_conversations(id),
      thread_id INTEGER REFERENCES threads(id),
      agent_provider TEXT NOT NULL,
      agent_model TEXT,
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      CHECK (
        (conversation_id IS NOT NULL AND thread_id IS NULL)
        OR (conversation_id IS NULL AND thread_id IS NOT NULL)
      )
    );

    INSERT INTO chat_sessions_new
      (id, conversation_id, thread_id, agent_provider, agent_model, title, created_at, updated_at, last_message_at, status)
    SELECT
      id, conversation_id, NULL, agent_provider, agent_model, title, created_at, updated_at, last_message_at, status
    FROM chat_sessions;

    DROP INDEX IF EXISTS idx_chat_sessions_conversation;
    DROP TABLE chat_sessions;
    ALTER TABLE chat_sessions_new RENAME TO chat_sessions;

    CREATE INDEX idx_chat_sessions_conversation
      ON chat_sessions(conversation_id, last_message_at DESC);
    CREATE INDEX idx_chat_sessions_thread
      ON chat_sessions(thread_id, last_message_at DESC);
  `,
};
