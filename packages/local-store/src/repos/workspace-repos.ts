import type { Db } from '../db.js';

export interface WorkspaceRepo {
  id: number;
  workspaceId: string;
  repoPath: string;
  displayName: string | null;
  targetBranch: string | null;
  isPrimary: boolean;
  addedAt: string;
}

interface WorkspaceRepoRow {
  id: number;
  workspace_id: string;
  repo_path: string;
  display_name: string | null;
  target_branch: string | null;
  is_primary: number;
  added_at: string;
}

export interface AddWorkspaceRepoInput {
  workspaceId: string;
  repoPath: string;
  displayName?: string;
  targetBranch?: string;
  /**
   * When true, the inserted row is marked is_primary=1 and any other rows
   * within the same workspace are atomically cleared in the same
   * transaction. Defaults to false.
   */
  primary?: boolean;
}

export class WorkspaceReposRepo {
  constructor(private readonly db: Db) {}

  listByWorkspace(workspaceId: string): WorkspaceRepo[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM workspace_repos WHERE workspace_id = ? ORDER BY added_at, id',
      )
      .all(workspaceId) as WorkspaceRepoRow[];
    return rows.map(rowToRepo);
  }

  findById(id: number): WorkspaceRepo | null {
    const row = this.db
      .prepare('SELECT * FROM workspace_repos WHERE id = ?')
      .get(id) as WorkspaceRepoRow | undefined;
    return row ? rowToRepo(row) : null;
  }

  findPrimary(workspaceId: string): WorkspaceRepo | null {
    const row = this.db
      .prepare(
        'SELECT * FROM workspace_repos WHERE workspace_id = ? AND is_primary = 1 LIMIT 1',
      )
      .get(workspaceId) as WorkspaceRepoRow | undefined;
    return row ? rowToRepo(row) : null;
  }

  /**
   * Insert a new repo row. If `primary` is true the insert + the demotion
   * of any existing primary for the workspace happen in a single
   * transaction. If a row with (workspace_id, repo_path) already exists,
   * the existing row is returned unchanged (use the setters to mutate).
   */
  add(input: AddWorkspaceRepoInput): WorkspaceRepo {
    const existing = this.db
      .prepare(
        'SELECT * FROM workspace_repos WHERE workspace_id = ? AND repo_path = ?',
      )
      .get(input.workspaceId, input.repoPath) as WorkspaceRepoRow | undefined;
    if (existing) return rowToRepo(existing);

    const addedAt = new Date().toISOString();
    const displayName = input.displayName ?? null;
    const targetBranch = input.targetBranch ?? null;
    const isPrimary = input.primary === true ? 1 : 0;

    const insert = this.db.prepare(
      `INSERT INTO workspace_repos
        (workspace_id, repo_path, display_name, target_branch, is_primary, added_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const clearOthers = this.db.prepare(
      'UPDATE workspace_repos SET is_primary = 0 WHERE workspace_id = ? AND is_primary = 1',
    );

    const insertedId = this.db.transaction((): number => {
      if (isPrimary === 1) {
        clearOthers.run(input.workspaceId);
      }
      const info = insert.run(
        input.workspaceId,
        input.repoPath,
        displayName,
        targetBranch,
        isPrimary,
        addedAt,
      );
      return Number(info.lastInsertRowid);
    })();

    const fresh = this.findById(insertedId);
    if (!fresh) {
      throw new Error(`workspace_repo ${insertedId} not found immediately after insert`);
    }
    return fresh;
  }

  setTargetBranch(id: number, targetBranch: string | null): void {
    this.db
      .prepare('UPDATE workspace_repos SET target_branch = ? WHERE id = ?')
      .run(targetBranch, id);
  }

  setDisplayName(id: number, displayName: string | null): void {
    this.db
      .prepare('UPDATE workspace_repos SET display_name = ? WHERE id = ?')
      .run(displayName, id);
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM workspace_repos WHERE id = ?').run(id);
  }

  /**
   * Atomically clear every other row's is_primary flag within the
   * workspace and mark `repoId` as the new primary. Throws if `repoId`
   * does not belong to `workspaceId`.
   */
  setPrimary(workspaceId: string, repoId: number): void {
    const owns = this.db
      .prepare(
        'SELECT 1 FROM workspace_repos WHERE id = ? AND workspace_id = ?',
      )
      .get(repoId, workspaceId);
    if (!owns) {
      throw new Error(
        `workspace_repo ${repoId} does not belong to workspace ${workspaceId}`,
      );
    }
    const clear = this.db.prepare(
      'UPDATE workspace_repos SET is_primary = 0 WHERE workspace_id = ? AND is_primary = 1',
    );
    const set = this.db.prepare(
      'UPDATE workspace_repos SET is_primary = 1 WHERE id = ?',
    );
    this.db.transaction(() => {
      clear.run(workspaceId);
      set.run(repoId);
    })();
  }
}

function rowToRepo(row: WorkspaceRepoRow): WorkspaceRepo {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    repoPath: row.repo_path,
    displayName: row.display_name,
    targetBranch: row.target_branch,
    isPrimary: row.is_primary === 1,
    addedAt: row.added_at,
  };
}
