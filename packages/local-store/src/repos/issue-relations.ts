import type { Db } from '../db.js';

/**
 * A persisted parent ↔ child link between two issues in the same
 * workspace. Either issue may be local (local_issues row) or backed by
 * GitHub — the repo only tracks numbers because issue numbers are
 * unique within a workspace at the surface layer.
 */
export interface IssueRelation {
  id: number;
  workspaceId: string;
  parentNumber: number;
  childNumber: number;
  createdAt: string;
}

interface IssueRelationRow {
  id: number;
  workspace_id: string;
  parent_number: number;
  child_number: number;
  created_at: string;
}

export interface AddIssueRelationInput {
  workspaceId: string;
  parentNumber: number;
  childNumber: number;
}

function rowToRelation(row: IssueRelationRow): IssueRelation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentNumber: row.parent_number,
    childNumber: row.child_number,
    createdAt: row.created_at,
  };
}

/**
 * Upper bound on how far `findRoot` walks before giving up. The handler
 * also walks the ancestor chain to reject cycles before insert, but a
 * corrupt DB (e.g. a hand-crafted relation that escapes the cycle check)
 * shouldn't be able to hang the renderer — so the walk caps out at 16.
 */
const MAX_ANCESTOR_DEPTH = 16;

export class IssueRelationsRepo {
  constructor(private readonly db: Db) {}

  listChildren(workspaceId: string, parentNumber: number): IssueRelation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM issue_relations
         WHERE workspace_id = ? AND parent_number = ?
         ORDER BY id`,
      )
      .all(workspaceId, parentNumber) as IssueRelationRow[];
    return rows.map(rowToRelation);
  }

  listParents(workspaceId: string, childNumber: number): IssueRelation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM issue_relations
         WHERE workspace_id = ? AND child_number = ?
         ORDER BY id`,
      )
      .all(workspaceId, childNumber) as IssueRelationRow[];
    return rows.map(rowToRelation);
  }

  findById(id: number): IssueRelation | null {
    const row = this.db
      .prepare('SELECT * FROM issue_relations WHERE id = ?')
      .get(id) as IssueRelationRow | undefined;
    return row ? rowToRelation(row) : null;
  }

  add(input: AddIssueRelationInput): IssueRelation {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO issue_relations
          (workspace_id, parent_number, child_number, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(input.workspaceId, input.parentNumber, input.childNumber, now);
    const fresh = this.findById(Number(info.lastInsertRowid));
    if (!fresh) {
      throw new Error(
        `issue_relations row ${info.lastInsertRowid} not found immediately after insert`,
      );
    }
    return fresh;
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM issue_relations WHERE id = ?').run(id);
  }

  /**
   * Walk up the parent chain from `childNumber` and return the root
   * ancestor (the first ancestor with no parent of its own), or null
   * when the issue itself is a root. Bounded at 16 hops so a corrupt
   * cycle can't hang the caller. If a node has multiple parents we
   * follow the first one — sub-issues are intended to be tree-shaped
   * (one parent per child), but the schema doesn't enforce single
   * parentage, so this picks the deterministic-by-id-order branch.
   */
  findRoot(workspaceId: string, childNumber: number): number | null {
    let current = childNumber;
    for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
      const parentRow = this.db
        .prepare(
          `SELECT parent_number FROM issue_relations
           WHERE workspace_id = ? AND child_number = ?
           ORDER BY id
           LIMIT 1`,
        )
        .get(workspaceId, current) as { parent_number: number } | undefined;
      if (!parentRow) {
        // No parent — `current` is the root. Return null if we never
        // moved (the original input is standalone).
        return current === childNumber ? null : current;
      }
      current = parentRow.parent_number;
    }
    // Hit the depth cap — the chain is either huge or corrupt. Surface
    // the last node we reached so callers can still navigate somewhere
    // sensible rather than crash.
    return current;
  }

  /**
   * Returns a map of parent_number → direct-child count for every
   * parent in the workspace. Used by the issues:list handler so the
   * board can show a "↳N" badge per card without an N+1 fetch. Parents
   * with zero children simply don't appear in the map.
   */
  countChildrenByParent(workspaceId: string): Map<number, number> {
    const rows = this.db
      .prepare(
        `SELECT parent_number AS parent, COUNT(*) AS count
         FROM issue_relations
         WHERE workspace_id = ?
         GROUP BY parent_number`,
      )
      .all(workspaceId) as Array<{ parent: number; count: number }>;
    const out = new Map<number, number>();
    for (const row of rows) {
      out.set(row.parent, row.count);
    }
    return out;
  }

  /**
   * Returns every ancestor of `childNumber` (excluding the issue
   * itself) up to depth 16. Used by the cycle-prevention check in the
   * handler — when adding a new relation parent→child, the new parent
   * is rejected if it appears in this set.
   */
  listAncestors(workspaceId: string, childNumber: number): number[] {
    const out: number[] = [];
    const seen = new Set<number>([childNumber]);
    let current = childNumber;
    for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
      const parentRow = this.db
        .prepare(
          `SELECT parent_number FROM issue_relations
           WHERE workspace_id = ? AND child_number = ?
           ORDER BY id
           LIMIT 1`,
        )
        .get(workspaceId, current) as { parent_number: number } | undefined;
      if (!parentRow) break;
      const next = parentRow.parent_number;
      // Defensive cycle break — the CHECK constraint and the handler's
      // pre-insert walk should both prevent this, but listAncestors is
      // called from the cycle check itself so it must terminate even
      // when the data is already corrupt.
      if (seen.has(next)) break;
      seen.add(next);
      out.push(next);
      current = next;
    }
    return out;
  }
}
