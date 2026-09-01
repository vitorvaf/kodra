import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0004_agent_model',
  up: `
    ALTER TABLE agent_runs ADD COLUMN model TEXT;
  `,
};
