import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0010_cost_budget',
  up: `
    ALTER TABLE agent_runs ADD COLUMN cost_budget_usd REAL;
  `,
};
