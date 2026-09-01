import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0002_agent_session',
  up: `
    ALTER TABLE agent_runs ADD COLUMN session_id TEXT;
    CREATE INDEX idx_agent_runs_session ON agent_runs(session_id);
  `,
};
