import type { Db } from '../db.js';

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  created_at: string;
}

export interface CreateWorkspaceInput {
  id: string;
  name: string;
}

export class WorkspacesRepo {
  constructor(private readonly db: Db) {}

  ensure(input: CreateWorkspaceInput): Workspace {
    const existing = this.findById(input.id);
    if (existing) return existing;
    const createdAt = new Date().toISOString();
    this.db
      .prepare('INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)')
      .run(input.id, input.name, createdAt);
    return { id: input.id, name: input.name, createdAt };
  }

  rename(id: string, name: string): Workspace {
    this.db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, id);
    const found = this.findById(id);
    if (!found) throw new Error(`workspace ${id} not found`);
    return found;
  }

  findById(id: string): Workspace | null {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as
      | WorkspaceRow
      | undefined;
    return row ? rowToWorkspace(row) : null;
  }

  list(): Workspace[] {
    const rows = this.db
      .prepare('SELECT * FROM workspaces ORDER BY created_at')
      .all() as WorkspaceRow[];
    return rows.map(rowToWorkspace);
  }
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}
