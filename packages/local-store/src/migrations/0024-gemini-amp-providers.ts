import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0024_gemini_amp_providers',
  up: `
    INSERT OR IGNORE INTO provider_config (id, created_at, updated_at)
    VALUES
      ('gemini-cli', datetime('now'), datetime('now')),
      ('amp-cli',    datetime('now'), datetime('now'));
  `,
};
