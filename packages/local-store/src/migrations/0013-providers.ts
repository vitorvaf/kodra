import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0013_providers',
  up: `
    CREATE TABLE provider_config (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      default_model TEXT,
      key_encrypted BLOB,
      key_encryption TEXT NOT NULL DEFAULT 'plain',
      last_validated_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE provider_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      default_provider TEXT,
      default_model TEXT,
      env_migration_done INTEGER NOT NULL DEFAULT 0
    );

    INSERT INTO provider_settings (id) VALUES (1);

    INSERT INTO provider_config (id, created_at, updated_at) VALUES
      ('claude-code', datetime('now'), datetime('now')),
      ('anthropic',   datetime('now'), datetime('now')),
      ('openai',      datetime('now'), datetime('now')),
      ('google',      datetime('now'), datetime('now')),
      ('deepseek',    datetime('now'), datetime('now')),
      ('xai',         datetime('now'), datetime('now'));
  `,
};
