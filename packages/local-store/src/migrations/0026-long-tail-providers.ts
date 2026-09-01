import type { Migration } from './types.js';

// Bulk-inserts the long-tail provider rows the kanbots desktop supports.
// Each row is opt-in (enabled=0 by default per the existing provider_config
// schema) — the user enables the provider via the Providers settings modal
// after confirming the CLI is installed and authenticated.
//
// Kept as a single migration rather than one per agent because the chain
// would otherwise balloon. Future single-agent additions should still get
// their own migration so analytics tooling can attribute changes cleanly.
export const migration: Migration = {
  id: '0026_long_tail_providers',
  up: `
    INSERT OR IGNORE INTO provider_config (id, created_at, updated_at)
    VALUES
      ('cursor-cli',   datetime('now'), datetime('now')),
      ('copilot-cli',  datetime('now'), datetime('now')),
      ('opencode-cli', datetime('now'), datetime('now')),
      ('droid-cli',    datetime('now'), datetime('now')),
      ('ccr-cli',      datetime('now'), datetime('now')),
      ('qwen-cli',     datetime('now'), datetime('now')),
      ('acp',          datetime('now'), datetime('now'));
  `,
};
