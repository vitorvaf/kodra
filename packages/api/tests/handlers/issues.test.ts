import { describe, expect, it } from 'vitest';
import { issueFixture } from '../helpers/fixtures.js';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

describe('issues:list', () => {
  it('returns issues decorated with status / agent / activeRun', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssues('open', [issueFixture(1, 'first', { labels: ['status:todo'] })]);
    const result = await handlers['issues:list']({ state: 'open' });
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('todo');
    expect(result[0]).toHaveProperty('activeRun');
  });
});

describe('issues:get', () => {
  it('returns issue + thread payload', async () => {
    const { handlers, source, store } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky'));
    source.setComments(7, []);
    store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 });

    const result = await handlers['issues:get']({ number: 7 });
    expect(result.issue.number).toBe(7);
    expect(result.thread).not.toBeNull();
  });

  it('throws NotFound when the issue does not exist', async () => {
    const { handlers } = makeHandlerTestKit();
    await expect(handlers['issues:get']({ number: 9999 })).rejects.toThrow();
  });
});

describe('issues:patch', () => {
  it('updates labels and returns a decorated issue', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky', { labels: ['status:todo'] }));
    const result = await handlers['issues:patch']({
      number: 7,
      patch: { labels: ['status:in-progress'] },
    });
    expect(result.status).toBe('inProgress');
  });
});

describe('issues:post-message', () => {
  it('creates a user message and returns the thread payload', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky'));
    const result = await handlers['issues:post-message']({
      number: 7,
      body: 'hello',
      dispatch: false,
    });
    expect(result.message.role).toBe('user');
    expect(result.message.body).toBe('hello');
    expect(result.thread?.messages).toHaveLength(1);
  });
});

describe('issues:dispatch', () => {
  it('starts a fresh run on an issue with no active run', async () => {
    const { handlers, source, supervisor } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky'));
    const result = await handlers['issues:dispatch']({
      number: 7,
      fromStatus: 'todo',
    });
    expect(result.run.status).toBe('running');
    expect(supervisor.calls.some((c) => c.type === 'start')).toBe(true);
  });

  it('throws AlreadyActive when a run is already active', async () => {
    const { handlers, source, store } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky'));
    const t = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 });
    const run = store.agentRuns.create({ threadId: t.id });
    store.agentRuns.update(run.id, { status: 'running' });

    await expect(
      handlers['issues:dispatch']({ number: 7, fromStatus: 'todo' }),
    ).rejects.toMatchObject({ name: 'AlreadyActive' });
  });
});

describe('issues:list-runs', () => {
  it('returns an empty list when the issue has no thread', async () => {
    const { handlers } = makeHandlerTestKit();
    expect(await handlers['issues:list-runs']({ number: 42 })).toEqual([]);
  });
});

describe('issues:create', () => {
  it('creates an issue and returns it decorated', async () => {
    const { handlers } = makeHandlerTestKit();
    const result = await handlers['issues:create']({
      title: 'fresh',
      body: 'body',
      labels: ['status:backlog'],
    });
    expect(result.title).toBe('fresh');
    expect(result.status).toBe('backlog');
  });
});

describe('issues:add-comment', () => {
  it('returns the new comment', async () => {
    const { handlers, source } = makeHandlerTestKit();
    source.setIssue(issueFixture(7, 'lucky'));
    source.setComments(7, []);
    const result = await handlers['issues:add-comment']({ number: 7, body: 'hey' });
    expect(result.body).toBe('hey');
  });
});
