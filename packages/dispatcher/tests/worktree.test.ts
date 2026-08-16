import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultWorktreePath, resolveWorktreePath } from '../src/worktree.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'kanbots-worktree-path-'));
  tempDirs.push(repo);
  return repo;
}

describe('worktree path resolution', () => {
  it('uses the Kodra path for a new worktree', () => {
    const repo = makeRepo();

    expect(defaultWorktreePath({ repoPath: repo, issueNumber: 42, runId: 7 })).toBe(
      join(repo, '.kodra', 'worktrees', 'issue-42-7'),
    );
  });

  it('falls back to an existing legacy worktree', () => {
    const repo = makeRepo();
    const legacyPath = join(repo, '.kanbots', 'worktrees', 'issue-42-run-7');
    mkdirSync(legacyPath, { recursive: true });

    const path = resolveWorktreePath(repo, 42, 'run-7');

    expect(existsSync(path)).toBe(true);
    expect(path).toBe(legacyPath);
  });
});
