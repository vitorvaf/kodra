import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { describeKanbotsDir, ensureKanbotsDir } from '../src/workspace.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'kanbots-workspace-dir-'));
  tempDirs.push(repo);
  return repo;
}

describe('workspace directory resolution', () => {
  it('uses the legacy directory when it already exists', () => {
    const repo = makeRepo();
    mkdirSync(join(repo, '.kanbots'));

    expect(describeKanbotsDir(repo).root).toBe(join(repo, '.kanbots'));
  });

  it('uses the Kodra directory when no legacy directory exists', () => {
    const repo = makeRepo();

    expect(describeKanbotsDir(repo).root).toBe(join(repo, '.kodra'));
  });

  it('creates worktrees under the Kodra directory for a fresh repository', async () => {
    const repo = makeRepo();

    const dir = await ensureKanbotsDir(repo);

    expect(dir.root).toBe(join(repo, '.kodra'));
    expect(existsSync(join(repo, '.kodra', 'worktrees'))).toBe(true);
  });
});
