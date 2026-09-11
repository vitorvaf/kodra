import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { issueFixture } from '../helpers/fixtures.js';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('agent-runs:get', () => {
  it('returns the run when it exists', async () => {
    const { handlers, store } = makeHandlerTestKit();
    const t = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 1 });
    const run = store.agentRuns.create({ threadId: t.id });
    const result = await handlers['agent-runs:get']({ runId: run.id });
    expect(result.id).toBe(run.id);
  });

  it('throws NotFound when the run does not exist', async () => {
    const { handlers } = makeHandlerTestKit();
    await expect(handlers['agent-runs:get']({ runId: 9999 })).rejects.toMatchObject({
      name: 'NotFound',
    });
  });
});

describe('agent-runs:stop', () => {
  it('marks the run as stopped via the supervisor', async () => {
    const { handlers, store, supervisor } = makeHandlerTestKit();
    const t = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 1 });
    const run = store.agentRuns.create({ threadId: t.id });
    store.agentRuns.update(run.id, { status: 'running' });
    const result = await handlers['agent-runs:stop']({ runId: run.id });
    expect(result.status).toBe('stopped');
    expect(supervisor.calls.some((c) => c.type === 'stop')).toBe(true);
  });
});

describe('agent-runs:promote-pr', () => {
  it('creates a PR from local cards without forwarding the local numeric issue id', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'kanbots-promote-pr-local-'));
    const remote = mkdtempSync(join(tmpdir(), 'kanbots-promote-local-remote-'));
    tempDirs.push(repo, remote);
    execFileSync('git', ['init', '--bare', '-q', remote]);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    writeFileSync(join(repo, 'README.md'), 'initial\n');
    execFileSync('git', ['add', 'README.md'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'initial'], { cwd: repo });
    execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: repo });
    execFileSync('git', ['checkout', '-qb', 'kodra/issue-7'], { cwd: repo });
    writeFileSync(join(repo, 'README.md'), 'change\n');
    execFileSync('git', ['commit', '-qam', 'change'], { cwd: repo });

    const { handlers, store, source } = makeHandlerTestKit({ mode: 'local', repoPath: repo });
    source.setIssue(issueFixture(7, 'local feature'));
    const openDraftPR = vi.fn().mockResolvedValue({
      number: 44,
      title: 'local feature',
      body: '',
      state: 'open',
      draft: true,
      htmlUrl: 'https://github.com/octo/hello/pull/44',
      head: 'kodra/issue-7',
      base: 'main',
    });
    (source as unknown as { openDraftPR: typeof openDraftPR }).openDraftPR = openDraftPR;
    const thread = store.threads.create({
      repoOwner: 'local',
      repoName: 'hello',
      issueNumber: 7,
    });
    const run = store.agentRuns.create({
      threadId: thread.id,
      worktreePath: repo,
      branchName: 'kodra/issue-7',
    });

    await handlers['agent-runs:promote-pr']({ runId: run.id });

    expect(openDraftPR).toHaveBeenCalledWith(
      expect.not.objectContaining({ issueNumber: expect.anything() }),
    );
  });

  it('rejects local PR creation when the source has no GitHub PR capability', async () => {
    const { handlers } = makeHandlerTestKit({ mode: 'local' });

    await expect(handlers['agent-runs:promote-pr']({ runId: 1 })).rejects.toMatchObject({
      name: 'BadRequest',
      message: expect.stringContaining('GitHub-hosted repository'),
    });
  });

  it('omits issueNumber for a custom-id issue', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'kanbots-promote-pr-'));
    const remote = mkdtempSync(join(tmpdir(), 'kanbots-promote-remote-'));
    tempDirs.push(repo, remote);
    execFileSync('git', ['init', '--bare', '-q', remote]);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    writeFileSync(join(repo, 'README.md'), 'initial\n');
    execFileSync('git', ['add', 'README.md'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'initial'], { cwd: repo });
    execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: repo });
    execFileSync('git', ['checkout', '-qb', 'kodra/issue-FEAT-42'], { cwd: repo });
    writeFileSync(join(repo, 'README.md'), 'change\n');
    execFileSync('git', ['commit', '-qam', 'change'], { cwd: repo });

    const { handlers, store, source } = makeHandlerTestKit({
      mode: 'github',
      repoPath: repo,
    });
    source.setIssue(issueFixture('FEAT-42', 'feature'));
    const openDraftPR = vi.fn().mockResolvedValue({
      number: 44,
      title: 'feature',
      body: '',
      state: 'open',
      draft: true,
      htmlUrl: 'https://github.com/octo/hello/pull/44',
      head: 'kodra/issue-FEAT-42',
      base: 'main',
    });
    (source as unknown as { openDraftPR: typeof openDraftPR }).openDraftPR = openDraftPR;
    const thread = store.threads.create({
      repoOwner: 'octo',
      repoName: 'hello',
      issueNumber: 'FEAT-42',
    });
    store.agentRuns.create({
      threadId: thread.id,
      worktreePath: repo,
      branchName: 'kodra/issue-FEAT-42',
    });

    await handlers['agent-runs:promote-pr']({ runId: 1 });

    expect(openDraftPR).toHaveBeenCalledWith(
      expect.not.objectContaining({ issueNumber: expect.anything() }),
    );

    source.setIssue(issueFixture(7, 'numeric feature'));
    const numericThread = store.threads.create({
      repoOwner: 'octo',
      repoName: 'hello',
      issueNumber: 7,
    });
    const numericRun = store.agentRuns.create({
      threadId: numericThread.id,
      worktreePath: repo,
      branchName: 'kodra/issue-FEAT-42',
    });
    await handlers['agent-runs:promote-pr']({ runId: numericRun.id });
    expect(openDraftPR).toHaveBeenLastCalledWith(
      expect.objectContaining({ issueNumber: 7 }),
    );
  });
});
