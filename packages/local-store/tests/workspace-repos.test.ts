import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStoreInMemory, type Store } from '../src/index.js';
import { migration as m0001 } from '../src/migrations/0001-initial.js';
import { migration as m0002 } from '../src/migrations/0002-agent-session.js';
import { migration as m0003 } from '../src/migrations/0003-local-issues.js';
import { migration as m0004 } from '../src/migrations/0004-agent-model.js';
import { migration as m0005 } from '../src/migrations/0005-workspaces-folders.js';
import { migration as m0006 } from '../src/migrations/0006-agent-cost.js';
import { migration as m0007 } from '../src/migrations/0007-agent-checks.js';
import { migration as m0008 } from '../src/migrations/0008-agent-preview.js';
import { migration as m0009 } from '../src/migrations/0009-autopilot-sessions.js';
import { migration as m0010 } from '../src/migrations/0010-sentry.js';
import { migration as m0011 } from '../src/migrations/0011-agent-stop-escalation.js';
import { migration as m0012 } from '../src/migrations/0012-cost-budget.js';
import { migration as m0013 } from '../src/migrations/0013-providers.js';
import { migration as m0014 } from '../src/migrations/0014-agent-run-provider.js';
import { migration as m0015 } from '../src/migrations/0015-thread-last-model.js';
import { migration as m0016 } from '../src/migrations/0016-chat-conversations.js';
import { migration as m0017 } from '../src/migrations/0017-codex-cli-provider.js';
import { migration as m0018 } from '../src/migrations/0018-remove-api-key-providers.js';
import { migration as m0020 } from '../src/migrations/0020-run-analytics.js';
import { migration as m0021 } from '../src/migrations/0021-learnings.js';
import { migration as m0022 } from '../src/migrations/0022-diff-hunks.js';
import { migration as m0023 } from '../src/migrations/0023-review-comments.js';
import { migration as m0024 } from '../src/migrations/0024-gemini-amp-providers.js';
import { migration as m0025 } from '../src/migrations/0025-multi-repo.js';
import { runMigrations } from '../src/migrations/runner.js';

describe('0025_multi_repo migration', () => {
  it('backfills folders into workspace_repos, marking the earliest folder as primary', () => {
    // Apply migrations through 0024 only, so we can stage workspace + folder
    // rows in the pre-0025 shape before the backfill runs.
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db, [
      m0001,
      m0002,
      m0003,
      m0004,
      m0005,
      m0006,
      m0007,
      m0008,
      m0009,
      m0010,
      m0011,
      m0012,
      m0013,
      m0014,
      m0015,
      m0016,
      m0017,
      m0018,
      m0020,
      m0021,
      m0022,
      m0023,
      m0024,
    ]);

    // Manually insert a workspace + two folders. The earlier one should
    // become the primary after the backfill.
    db.prepare(
      'INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)',
    ).run('ws-a', 'Workspace A', '2024-01-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO folders (id, workspace_id, name, path, default_branch, added_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'f-primary',
      'ws-a',
      'primary repo',
      '/home/user/code/primary',
      'main',
      '2024-01-01T00:00:00.000Z',
    );
    db.prepare(
      `INSERT INTO folders (id, workspace_id, name, path, default_branch, added_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'f-secondary',
      'ws-a',
      'secondary repo',
      '/home/user/code/secondary',
      'main',
      '2024-01-02T00:00:00.000Z',
    );

    // Apply 0025 — the backfill should populate workspace_repos.
    runMigrations(db, [m0025]);

    const rows = db
      .prepare(
        'SELECT workspace_id, repo_path, display_name, target_branch, is_primary, added_at FROM workspace_repos ORDER BY added_at',
      )
      .all() as Array<{
      workspace_id: string;
      repo_path: string;
      display_name: string | null;
      target_branch: string | null;
      is_primary: number;
      added_at: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      workspace_id: 'ws-a',
      repo_path: '/home/user/code/primary',
      display_name: 'primary repo',
      target_branch: null,
      is_primary: 1,
    });
    expect(rows[1]).toMatchObject({
      workspace_id: 'ws-a',
      repo_path: '/home/user/code/secondary',
      display_name: 'secondary repo',
      target_branch: null,
      is_primary: 0,
    });
    db.close();
  });

  it('runs cleanly when no folders exist (fresh install)', () => {
    const store = openStoreInMemory();
    const count = (
      store.db.prepare('SELECT COUNT(*) AS n FROM workspace_repos').get() as {
        n: number;
      }
    ).n;
    expect(count).toBe(0);
    store.close();
  });
});

describe('WorkspaceReposRepo', () => {
  let store: Store;
  const workspaceId = 'ws-multi';

  beforeEach(() => {
    store = openStoreInMemory();
    store.workspaces.ensure({ id: workspaceId, name: 'Multi' });
  });

  afterEach(() => {
    store.close();
  });

  it('adds a repo with the primary flag and marks it primary', () => {
    const repo = store.workspaceRepos.add({
      workspaceId,
      repoPath: '/tmp/r1',
      displayName: 'r1',
      primary: true,
    });
    expect(repo.isPrimary).toBe(true);
    expect(repo.displayName).toBe('r1');
    expect(repo.targetBranch).toBeNull();

    const primary = store.workspaceRepos.findPrimary(workspaceId);
    expect(primary?.id).toBe(repo.id);
  });

  it('returns the existing row if the (workspace, path) pair already exists', () => {
    const a = store.workspaceRepos.add({
      workspaceId,
      repoPath: '/tmp/dup',
      primary: true,
    });
    const b = store.workspaceRepos.add({
      workspaceId,
      repoPath: '/tmp/dup',
    });
    expect(a.id).toBe(b.id);
  });

  it('atomically demotes the previous primary when setPrimary moves the flag', () => {
    const a = store.workspaceRepos.add({
      workspaceId,
      repoPath: '/tmp/a',
      primary: true,
    });
    const b = store.workspaceRepos.add({
      workspaceId,
      repoPath: '/tmp/b',
    });
    store.workspaceRepos.setPrimary(workspaceId, b.id);
    const list = store.workspaceRepos.listByWorkspace(workspaceId);
    const aAfter = list.find((r) => r.id === a.id);
    const bAfter = list.find((r) => r.id === b.id);
    expect(aAfter?.isPrimary).toBe(false);
    expect(bAfter?.isPrimary).toBe(true);
  });

  it('also clears existing primary when adding a new repo with primary: true', () => {
    const a = store.workspaceRepos.add({
      workspaceId,
      repoPath: '/tmp/a',
      primary: true,
    });
    const b = store.workspaceRepos.add({
      workspaceId,
      repoPath: '/tmp/b',
      primary: true,
    });
    const aAfter = store.workspaceRepos.findById(a.id);
    const bAfter = store.workspaceRepos.findById(b.id);
    expect(aAfter?.isPrimary).toBe(false);
    expect(bAfter?.isPrimary).toBe(true);
  });

  it('refuses to setPrimary on a repo from a different workspace', () => {
    store.workspaces.ensure({ id: 'ws-other', name: 'Other' });
    const r = store.workspaceRepos.add({
      workspaceId: 'ws-other',
      repoPath: '/tmp/other',
    });
    expect(() => store.workspaceRepos.setPrimary(workspaceId, r.id)).toThrow();
  });

  it('updates display_name and target_branch in place', () => {
    const r = store.workspaceRepos.add({
      workspaceId,
      repoPath: '/tmp/r',
      primary: true,
    });
    store.workspaceRepos.setDisplayName(r.id, 'renamed');
    store.workspaceRepos.setTargetBranch(r.id, 'develop');
    const fresh = store.workspaceRepos.findById(r.id);
    expect(fresh?.displayName).toBe('renamed');
    expect(fresh?.targetBranch).toBe('develop');
  });

  it('cascades delete when the workspace is dropped', () => {
    store.workspaceRepos.add({
      workspaceId,
      repoPath: '/tmp/cascade',
      primary: true,
    });
    store.db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
    expect(store.workspaceRepos.listByWorkspace(workspaceId)).toHaveLength(0);
  });
});
