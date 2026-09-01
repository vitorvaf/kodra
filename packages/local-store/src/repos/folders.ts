import type { Db } from '../db.js';

export interface Folder {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  defaultBranch: string;
  addedAt: string;
}

interface FolderRow {
  id: string;
  workspace_id: string;
  name: string;
  path: string;
  default_branch: string;
  added_at: string;
}

export interface CreateFolderInput {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  defaultBranch?: string;
}

export class FoldersRepo {
  constructor(private readonly db: Db) {}

  ensure(input: CreateFolderInput): Folder {
    const existing = this.findByPath(input.path);
    if (existing) return existing;
    const addedAt = new Date().toISOString();
    const branch = input.defaultBranch ?? 'main';
    this.db
      .prepare(
        `INSERT INTO folders (id, workspace_id, name, path, default_branch, added_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.id, input.workspaceId, input.name, input.path, branch, addedAt);
    return {
      id: input.id,
      workspaceId: input.workspaceId,
      name: input.name,
      path: input.path,
      defaultBranch: branch,
      addedAt,
    };
  }

  findById(id: string): Folder | null {
    const row = this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as
      | FolderRow
      | undefined;
    return row ? rowToFolder(row) : null;
  }

  findByPath(path: string): Folder | null {
    const row = this.db.prepare('SELECT * FROM folders WHERE path = ?').get(path) as
      | FolderRow
      | undefined;
    return row ? rowToFolder(row) : null;
  }

  listByWorkspace(workspaceId: string): Folder[] {
    const rows = this.db
      .prepare('SELECT * FROM folders WHERE workspace_id = ? ORDER BY added_at')
      .all(workspaceId) as FolderRow[];
    return rows.map(rowToFolder);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM folders WHERE id = ?').run(id);
  }
}

function rowToFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    path: row.path,
    defaultBranch: row.default_branch,
    addedAt: row.added_at,
  };
}
