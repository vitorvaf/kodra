import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0006_agent_cost',
  up: `
    ALTER TABLE agent_runs ADD COLUMN total_cost_usd REAL;
    ALTER TABLE agent_runs ADD COLUMN duration_ms INTEGER;
  `,
};
