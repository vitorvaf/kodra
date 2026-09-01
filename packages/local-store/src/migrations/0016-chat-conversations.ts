import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0016_chat_conversations',
  up: `
    CREATE TABLE chat_conversations (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL,
      thread_id INTEGER REFERENCES threads(id)
    );

    CREATE INDEX idx_chat_conversations_last_message
      ON chat_conversations(last_message_at DESC);
  `,
};
