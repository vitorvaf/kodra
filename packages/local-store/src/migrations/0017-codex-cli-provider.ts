import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0017_codex_cli_provider',
  up: `
    INSERT OR IGNORE INTO provider_config (id, created_at, updated_at)
    VALUES ('codex-cli', datetime('now'), datetime('now'));
  `,
};
