import type { Migration } from './types.js';

// Registers the Google Antigravity CLI (agy) provider row. Opt-in
// (enabled=0 by default) — the user enables it via the Providers settings
// modal after confirming the CLI is installed and authenticated.
export const migration: Migration = {
  id: '0031_agy_cli_provider',
  up: `
    INSERT OR IGNORE INTO provider_config (id, created_at, updated_at)
    VALUES ('agy-cli', datetime('now'), datetime('now'));
  `,
};
