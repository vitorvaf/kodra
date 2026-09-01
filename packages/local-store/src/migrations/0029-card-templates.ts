import type { Migration } from './types.js';

// Card templates: per-workspace saved presets that spawn a new card with
// one click. Each template captures a title pattern, optional body
// (with `{{cursor}}` placeholder support handled by the renderer), a
// JSON-serialised label-set, and an optional default agent provider so
// the new issue dispatches without a second click.
//
// `sort_order` is a stable integer that the renderer drives via a drag
// handle in the settings modal; we ship the canonical order rather than
// derive it from `created_at` so reordering is a O(N) UPDATE, not a row
// rebuild.
//
// Seed three starter templates per existing workspace ("Bug triage",
// "Feature draft", "Add tests") so the surface isn't empty after the
// migration runs. The seed only fires when the workspace currently has
// zero templates — a `WHERE NOT EXISTS` guard makes repeated runs idempotent
// across DBs where some workspaces already have a manual template set
// (e.g. after a partial restore from backup).
export const migration: Migration = {
  id: '0029_card_templates',
  up: `
    CREATE TABLE card_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      title_template TEXT NOT NULL,
      body_template TEXT,
      labels TEXT,
      default_provider TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_card_templates_workspace
      ON card_templates(workspace_id, sort_order);

    INSERT INTO card_templates
      (workspace_id, name, title_template, body_template, labels, default_provider, sort_order, created_at, updated_at)
    SELECT
      w.id,
      'Bug triage',
      'Bug: ',
      'Steps to reproduce:' || char(10) || '1. {{cursor}}' || char(10) || char(10) || 'Expected:' || char(10) || char(10) || 'Actual:' || char(10),
      '["type:fix","priority:p2"]',
      NULL,
      0,
      datetime('now'),
      datetime('now')
    FROM workspaces w
    WHERE NOT EXISTS (
      SELECT 1 FROM card_templates ct WHERE ct.workspace_id = w.id
    );

    INSERT INTO card_templates
      (workspace_id, name, title_template, body_template, labels, default_provider, sort_order, created_at, updated_at)
    SELECT
      w.id,
      'Feature draft',
      'Feat: ',
      'Goal:' || char(10) || '{{cursor}}' || char(10) || char(10) || 'AC:' || char(10) || '- ',
      '["type:feat","priority:p2"]',
      NULL,
      1,
      datetime('now'),
      datetime('now')
    FROM workspaces w
    WHERE (
      SELECT COUNT(*) FROM card_templates ct WHERE ct.workspace_id = w.id
    ) = 1;

    INSERT INTO card_templates
      (workspace_id, name, title_template, body_template, labels, default_provider, sort_order, created_at, updated_at)
    SELECT
      w.id,
      'Add tests',
      'Tests: ',
      'Add tests for {{cursor}}.' || char(10) || char(10) || 'Cover:' || char(10) || '- ',
      '["type:chore","priority:p3","area:tests"]',
      NULL,
      2,
      datetime('now'),
      datetime('now')
    FROM workspaces w
    WHERE (
      SELECT COUNT(*) FROM card_templates ct WHERE ct.workspace_id = w.id
    ) = 2;
  `,
};
