import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0034_agent_runs_base_branch',
  up: `
    ALTER TABLE agent_runs ADD COLUMN base_branch TEXT;
  `,
};
