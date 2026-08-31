import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { issueFixture } from '../helpers/fixtures.js';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

const execFileAsync = promisify(execFile);

describe('issues:archive', () => {
  it('replaces status/agent labels with `archived` and returns a decorated issue', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky', { labels: ['status:todo', 'agent:idle'] }));
    const result = await handlers['issues:archive']({ number: 7 });
    expect(result.labels).toContain('archived');
    expect(result.labels).not.toContain('status:todo');
    expect(result.state).toBe('closed');
    expect(result).toHaveProperty('activeRun');
  });
});

describe('issues:approve', () => {
  it('marks the issue done and closed', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky', { labels: ['status:review'] }));
    const result = await handlers['issues:approve']({ number: 7 });
    expect(result.labels).toContain('status:done');
    expect(result.state).toBe('closed');
  });
});

describe('issues:request-changes', () => {
  it('moves the issue back to in-progress with agent:blocked', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky', { labels: ['status:review'] }));
    const result = await handlers['issues:request-changes']({ number: 7 });
    expect(result.labels).toContain('status:in-progress');
    expect(result.labels).toContain('agent:blocked');
  });
});

describe('issues:pr-approve', () => {
  it('falls back to the issue label flip when no PR exists', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky', { labels: ['status:review'] }));
    const findOpenPullForBranch = vi.fn().mockResolvedValue(null);
    const approvePullRequest = vi.fn().mockResolvedValue(undefined);
    source.findOpenPullForBranch = findOpenPullForBranch;
    source.approvePullRequest = approvePullRequest;
    const result = await handlers['issues:pr-approve']({ number: 7 });
    expect(result.labels).toContain('status:done');
    expect(result.state).toBe('closed');
    expect(approvePullRequest).not.toHaveBeenCalled();
  });

  it('reviews the open PR and applies the issue label flip', async () => {
    const { handlers, source, store } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky', { labels: ['status:review'] }));
    const thread = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 });
    const run = store.agentRuns.create({ threadId: thread.id });
    store.agentRuns.update(run.id, { branchName: 'kodra/issue-7-1' });
    const findOpenPullForBranch = vi.fn().mockImplementation(async (branch: string) => {
      expect(branch).toBe('kodra/issue-7-1');
      return { number: 42 } as Awaited<ReturnType<NonNullable<typeof source.findOpenPullForBranch>>>;
    });
    const approvePullRequest = vi.fn().mockResolvedValue(undefined);
    source.findOpenPullForBranch = findOpenPullForBranch;
    source.approvePullRequest = approvePullRequest;

    const result = await handlers['issues:pr-approve']({ number: 7 });
    expect(result.labels).toContain('status:done');
    expect(approvePullRequest).toHaveBeenCalledWith({
      pullNumber: 42,
      body: 'Approved via Kodra.',
    });
  });
});

describe('issues:split', () => {
  it('creates child issues and returns decorated children', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'parent'));
    const result = await handlers['issues:split']({
      number: 7,
      subtasks: [{ title: 'a' }, { title: 'b' }],
    });
    expect(result.parent).toBe(7);
    expect(result.children).toHaveLength(2);
    expect(result.children[0]?.labels).toContain('parent:7');
  });

  it('rejects empty subtasks via validation', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'parent'));
    await expect(
      handlers['issues:split']({ number: 7, subtasks: [] }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('issues:reviewer', () => {
  it('throws BadRequest when no thread exists for the issue', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky'));
    await expect(
      handlers['issues:reviewer']({ number: 7 }),
    ).rejects.toMatchObject({ name: 'BadRequest' });
  });

  it('starts with a detached review worktree from the latest run', async () => {
    const { handlers, source, store, supervisor } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky'));
    const thread = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 });
    const repoPath = await mkdtemp(join(tmpdir(), 'kodra-review-'));
    let reviewPath: string | undefined;
    try {
      await execFileAsync('git', ['init', '-q'], { cwd: repoPath });
      await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });
      await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repoPath });
      await writeFile(join(repoPath, 'README.md'), 'review me\n');
      await execFileAsync('git', ['add', 'README.md'], { cwd: repoPath });
      await execFileAsync('git', ['commit', '-qm', 'initial'], { cwd: repoPath });
      const run = store.agentRuns.create({ threadId: thread.id });
      store.agentRuns.update(run.id, {
        worktreePath: repoPath,
        branchName: 'kodra/issue-7-source',
      });

      await handlers['issues:reviewer']({ number: 7, threadId: thread.id });
      const startCall = supervisor.calls.find((call) => call.type === 'start');
      const startArgs = startCall?.args as { worktreePath?: string };
      reviewPath = startArgs.worktreePath;
      expect(reviewPath).toMatch(/-review-[a-z0-9]+$/);
    } finally {
      if (reviewPath) {
        await execFileAsync('git', ['worktree', 'remove', '--force', reviewPath], {
          cwd: repoPath,
        }).catch(() => undefined);
      }
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});

describe('issues:start-agent', () => {
  it('starts via the supervisor', async () => {
    const { handlers, store, supervisor } = makeHandlerTestKit();
    const t = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 });
    const result = await handlers['issues:start-agent']({
      number: 7,
      threadId: t.id,
      prompt: 'do the thing',
    });
    expect(result.status).toBe('running');
    expect(supervisor.calls.some((c) => c.type === 'start')).toBe(true);
  });
});
