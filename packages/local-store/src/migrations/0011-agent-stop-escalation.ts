import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0010_agent_stop_escalation',
  up: `
    ALTER TABLE agent_runs ADD COLUMN stop_escalation TEXT;
  `,
};
