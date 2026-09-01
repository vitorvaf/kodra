import type { Db } from '../db.js';

/**
 * A reusable card template stored per workspace. Renderer surfaces it
 * as a "From template" quick-pick in the create-task modal and as a
 * managed list in its own settings modal. `labels` is persisted as a
 * JSON-encoded `string[]` so SQLite stays a simple key/value document
 * for the array — the repo class hides that detail from callers and
 * returns a real array.
 */
export interface CardTemplate {
  id: number;
  workspaceId: string;
  name: string;
  titleTemplate: string;
  bodyTemplate: string | null;
  labels: string[];
  defaultProvider: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface CardTemplateRow {
  id: number;
  workspace_id: string;
  name: string;
  title_template: string;
  body_template: string | null;
  labels: string | null;
  default_provider: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCardTemplateInput {
  workspaceId: string;
  name: string;
  titleTemplate: string;
  bodyTemplate?: string | null;
  labels?: string[];
  defaultProvider?: string | null;
}

export interface UpdateCardTemplatePatch {
  name?: string;
  titleTemplate?: string;
  bodyTemplate?: string | null;
  labels?: string[];
  defaultProvider?: string | null;
}

export class CardTemplatesRepo {
  constructor(private readonly db: Db) {}

  listByWorkspace(workspaceId: string): CardTemplate[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM card_templates WHERE workspace_id = ? ORDER BY sort_order, id',
      )
      .all(workspaceId) as CardTemplateRow[];
    return rows.map(rowToTemplate);
  }

  findById(id: number): CardTemplate | null {
    const row = this.db
      .prepare('SELECT * FROM card_templates WHERE id = ?')
      .get(id) as CardTemplateRow | undefined;
    return row ? rowToTemplate(row) : null;
  }

  /**
   * Insert a new template. `sort_order` defaults to (max + 1) within
   * the workspace so a freshly created row lands at the end of the
   * list rather than colliding with an existing position.
   */
  create(input: CreateCardTemplateInput): CardTemplate {
    const now = new Date().toISOString();
    const max = this.db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS m FROM card_templates WHERE workspace_id = ?',
      )
      .get(input.workspaceId) as { m: number };
    const sortOrder = max.m + 1;
    const labels =
      input.labels && input.labels.length > 0 ? JSON.stringify(input.labels) : null;
    const info = this.db
      .prepare(
        `INSERT INTO card_templates
          (workspace_id, name, title_template, body_template, labels, default_provider, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.workspaceId,
        input.name,
        input.titleTemplate,
        input.bodyTemplate ?? null,
        labels,
        input.defaultProvider ?? null,
        sortOrder,
        now,
        now,
      );
    const fresh = this.findById(Number(info.lastInsertRowid));
    if (!fresh) {
      throw new Error(
        `card_template ${info.lastInsertRowid} not found immediately after insert`,
      );
    }
    return fresh;
  }

  update(id: number, patch: UpdateCardTemplatePatch): CardTemplate {
    const existing = this.findById(id);
    if (!existing) throw new Error(`card_template ${id} not found`);
    const next: CardTemplate = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.titleTemplate !== undefined
        ? { titleTemplate: patch.titleTemplate }
        : {}),
      ...(patch.bodyTemplate !== undefined
        ? { bodyTemplate: patch.bodyTemplate }
        : {}),
      ...(patch.labels !== undefined ? { labels: patch.labels } : {}),
      ...(patch.defaultProvider !== undefined
        ? { defaultProvider: patch.defaultProvider }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    const labels = next.labels.length > 0 ? JSON.stringify(next.labels) : null;
    this.db
      .prepare(
        `UPDATE card_templates SET
           name = ?, title_template = ?, body_template = ?, labels = ?,
           default_provider = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.name,
        next.titleTemplate,
        next.bodyTemplate,
        labels,
        next.defaultProvider,
        next.updatedAt,
        id,
      );
    return next;
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM card_templates WHERE id = ?').run(id);
  }

  /**
   * Persist the canonical order for the given workspace. Each id in
   * `ids` gets its `sort_order` set to its position in the array. Ids
   * that don't belong to the workspace are ignored — the renderer's
   * drag-reorder may race a concurrent delete, and we don't want to
   * throw in that benign case.
   */
  reorder(workspaceId: string, ids: number[]): void {
    const update = this.db.prepare(
      'UPDATE card_templates SET sort_order = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
    );
    const now = new Date().toISOString();
    this.db.transaction(() => {
      ids.forEach((id, index) => {
        update.run(index, now, id, workspaceId);
      });
    })();
  }
}

function rowToTemplate(row: CardTemplateRow): CardTemplate {
  let labels: string[] = [];
  if (row.labels) {
    try {
      const parsed: unknown = JSON.parse(row.labels);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
        labels = parsed;
      }
    } catch {
      // corrupt row — treat as empty rather than crash the list.
    }
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    titleTemplate: row.title_template,
    bodyTemplate: row.body_template,
    labels,
    defaultProvider: row.default_provider,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
