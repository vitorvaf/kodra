import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0014_agent_run_provider',
  up: `
    ALTER TABLE agent_runs ADD COLUMN provider TEXT;
    UPDATE agent_runs SET provider = 'claude-code' WHERE provider IS NULL;
  `,
};
