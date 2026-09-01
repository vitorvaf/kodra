import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0008_agent_preview',
  up: `
    ALTER TABLE agent_runs ADD COLUMN preview_url TEXT;
    ALTER TABLE agent_runs ADD COLUMN preview_state TEXT;
    ALTER TABLE agent_runs ADD COLUMN preview_pid INTEGER;
  `,
};
