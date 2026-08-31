import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultBranchName, defaultWorktreePath, resolveWorktreePath } from '../src/worktree.js';
import { stampWorktreeIdentity } from '../src/worktree-identity.js';

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

  it('uses custom issue ids in branch and worktree names', () => {
    const repo = makeRepo();

    expect(defaultBranchName({ issueNumber: 'FEAT-42', runId: 7 })).toBe('kodra/issue-FEAT-42-7');
    expect(defaultWorktreePath({ repoPath: repo, issueNumber: 'FEAT-42', runId: 7 })).toBe(
      join(repo, '.kodra', 'worktrees', 'issue-FEAT-42-7'),
    );
  });

  it('slugifies hostile issue ids for filesystem and branch names', () => {
    const repo = makeRepo();

    expect(defaultBranchName({ issueNumber: 'fe at', runId: 7 })).toBe('kodra/issue-fe-at-7');
    expect(defaultWorktreePath({ repoPath: repo, issueNumber: 'fe at', runId: 7 })).toBe(
      join(repo, '.kodra', 'worktrees', 'issue-fe-at-7'),
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

  it('stamps custom issue ids into commit trailers', async () => {
    const repo = makeRepo();
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeFileSync(join(repo, 'file.txt'), 'initial\n');
    execFileSync('git', ['add', 'file.txt'], { cwd: repo });
    execFileSync(
      'git',
      ['-c', 'user.name=tester', '-c', 'user.email=tester@example.test', 'commit', '-qm', 'initial'],
      { cwd: repo },
    );

    await stampWorktreeIdentity({ worktreePath: repo, runId: 7, issueNumber: 'FEAT-42' });
    writeFileSync(join(repo, 'file.txt'), 'updated\n');
    execFileSync('git', ['add', 'file.txt'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'update'], { cwd: repo });

    const trailers = execFileSync(
      'git',
      ['show', '-s', '--format=%B', 'HEAD'],
      { cwd: repo, encoding: 'utf8' },
    );
    expect(trailers).toContain('Kodra-Issue: FEAT-42');
  });
});
