import { beforeEach, describe, expect, it } from 'vitest';
import { LocalIssueSource, openStoreInMemory, type Store } from '../src/index.js';

describe('LocalIssueSource', () => {
  let store: Store;
  let source: LocalIssueSource;

  beforeEach(() => {
    store = openStoreInMemory();
    source = new LocalIssueSource({ repo: store.localIssues, authorLogin: 'leo' });
  });

  it('createIssue uses authorLogin from constructor', async () => {
    const issue = await source.createIssue({ title: 'first' });
    expect(issue.user.login).toBe('leo');
    expect(issue.number).toBe(1);
  });

  it('listIssues defaults to open state', async () => {
    await source.createIssue({ title: 'a' });
    await source.createIssue({ title: 'b' });
    await source.updateIssue(1, { state: 'closed' });

    const open = await source.listIssues();
    expect(open).toHaveLength(1);
    expect(open[0]!.title).toBe('b');
  });

  it('getIssue throws when missing', async () => {
    await expect(source.getIssue(999)).rejects.toThrowError(/not found/);
  });

  it('updateIssue applies labels patch', async () => {
    await source.createIssue({ title: 't' });
    const updated = await source.updateIssue(1, { labels: ['status:todo'] });
    expect(updated.labels).toEqual(['status:todo']);
  });

  it('addComment + listComments round-trip', async () => {
    await source.createIssue({ title: 't' });
    await source.addComment(1, 'first');
    await source.addComment(1, 'second');
    const comments = await source.listComments(1);
    expect(comments.map((c) => c.body)).toEqual(['first', 'second']);
    expect(comments[0]!.user.login).toBe('leo');
  });

  it('htmlUrl is empty for local issues + comments', async () => {
    const issue = await source.createIssue({ title: 't' });
    expect(issue.htmlUrl).toBe('');
    await source.addComment(1, 'c');
    const comments = await source.listComments(1);
    expect(comments[0]!.htmlUrl).toBe('');
  });

  it('different authorLogin per source instance', async () => {
    const alice = new LocalIssueSource({
      repo: store.localIssues,
      authorLogin: 'alice',
    });
    const bob = new LocalIssueSource({
      repo: store.localIssues,
      authorLogin: 'bob',
    });
    const a = await alice.createIssue({ title: 'a' });
    const b = await bob.createIssue({ title: 'b' });
    expect(a.user.login).toBe('alice');
    expect(b.user.login).toBe('bob');
  });
});
