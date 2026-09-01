import { openStoreInMemory } from '@kanbots/local-store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reconcileIssueLabels } from '../src/workspace-reconcile.js';
import { FakeIssueSource } from './helpers/fakes.js';
import { issueFixture } from './helpers/fixtures.js';

describe('reconcileIssueLabels', () => {
  let store: ReturnType<typeof openStoreInMemory>;
  let source: FakeIssueSource;

  beforeEach(() => {
    store = openStoreInMemory();
    source = new FakeIssueSource();
  });

  afterEach(() => {
    store.close();
  });

  it('demotes in-progress issues with no active run to todo', async () => {
    const stale = issueFixture(7, 'stale', {
      labels: ['status:in-progress', 'agent:running'],
    });
    source.setIssues('open', [stale]);

    const result = await reconcileIssueLabels(source, store, 'octo', 'hello');

    expect(result.demoted).toEqual([7]);
    const after = await source.getIssue(7);
    expect(after.labels).toContain('status:todo');
    expect(after.labels).not.toContain('status:in-progress');
    expect(after.labels).toContain('agent:idle');
    expect(after.labels).not.toContain('agent:running');
  });

  it('leaves issues with an active awaiting_input run alone', async () => {
    const thread = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 });
    const run = store.agentRuns.create({ threadId: thread.id });
    store.agentRuns.update(run.id, { status: 'awaiting_input' });

    const blocked = issueFixture(7, 'blocked', {
      labels: ['status:in-progress', 'agent:blocked'],
    });
    source.setIssues('open', [blocked]);

    const result = await reconcileIssueLabels(source, store, 'octo', 'hello');

    expect(result.demoted).toEqual([]);
    const after = await source.getIssue(7);
    expect(after.labels).toContain('status:in-progress');
    expect(after.labels).toContain('agent:blocked');
  });

  it('clears stuck agent labels even when status is something else', async () => {
    const stuck = issueFixture(8, 'review-stuck', {
      labels: ['status:review', 'agent:running'],
    });
    source.setIssues('open', [stuck]);

    const result = await reconcileIssueLabels(source, store, 'octo', 'hello');

    expect(result.demoted).toEqual([8]);
    const after = await source.getIssue(8);
    expect(after.labels).toContain('status:review');
    expect(after.labels).toContain('agent:idle');
    expect(after.labels).not.toContain('agent:running');
  });

  it('skips issues that are already in healthy states', async () => {
    const todo = issueFixture(9, 'todo', { labels: ['status:todo', 'agent:idle'] });
    const done = issueFixture(10, 'done', { labels: ['status:done', 'agent:idle'] });
    source.setIssues('open', [todo, done]);

    const result = await reconcileIssueLabels(source, store, 'octo', 'hello');
    expect(result.demoted).toEqual([]);
  });

  it('continues past a failing updateIssue', async () => {
    const a = issueFixture(11, 'a', { labels: ['status:in-progress', 'agent:running'] });
    const b = issueFixture(12, 'b', { labels: ['status:in-progress', 'agent:running'] });
    source.setIssues('open', [a, b]);
    source.failUpdate(500, 'boom');

    const result = await reconcileIssueLabels(source, store, 'octo', 'hello');

    expect(result.demoted).toEqual([12]);
    const a2 = await source.getIssue(11);
    const b2 = await source.getIssue(12);
    expect(a2.labels).toContain('status:in-progress');
    expect(b2.labels).toContain('status:todo');
  });
});
