import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0020_run_analytics',
  up: `
    ALTER TABLE agent_runs ADD COLUMN persona_id TEXT;
    ALTER TABLE agent_runs ADD COLUMN card_kind TEXT;
    ALTER TABLE agent_runs ADD COLUMN card_size_bucket TEXT;
    ALTER TABLE agent_runs ADD COLUMN issue_body_chars INTEGER;
    ALTER TABLE agent_runs ADD COLUMN success_signal TEXT;

    CREATE INDEX idx_agent_runs_rollup ON agent_runs(persona_id, model, started_at);
    CREATE INDEX idx_agent_runs_card_kind ON agent_runs(card_kind, card_size_bucket);
    CREATE INDEX idx_agent_runs_success ON agent_runs(success_signal);
  `,
};
