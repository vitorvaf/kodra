import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStoreInMemory, type Store } from '../src/index.js';

describe('ThreadsRepo', () => {
  let store: Store;

  beforeEach(() => {
    store = openStoreInMemory();
  });

  afterEach(() => {
    store.close();
  });

  it('creates and retrieves a thread', () => {
    const t = store.threads.create({ repoOwner: 'octocat', repoName: 'hello', issueNumber: 1 });
    expect(t.id).toBeGreaterThan(0);
    expect(t.repoOwner).toBe('octocat');
    expect(t.repoName).toBe('hello');
    expect(t.issueNumber).toBe(1);
    expect(t.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const fetched = store.threads.findById(t.id);
    expect(fetched).toEqual(t);
  });

  it('finds by issue', () => {
    store.threads.create({ repoOwner: 'a', repoName: 'b', issueNumber: 42 });
    const found = store.threads.findByIssue('a', 'b', 42);
    expect(found?.issueNumber).toBe(42);

    expect(store.threads.findByIssue('a', 'b', 99)).toBeNull();
  });

  it('enforces uniqueness on (owner, name, issue)', () => {
    store.threads.create({ repoOwner: 'a', repoName: 'b', issueNumber: 1 });
    expect(() => store.threads.create({ repoOwner: 'a', repoName: 'b', issueNumber: 1 })).toThrow();
  });

  it('getOrCreate is idempotent', () => {
    const t1 = store.threads.getOrCreate({ repoOwner: 'a', repoName: 'b', issueNumber: 5 });
    const t2 = store.threads.getOrCreate({ repoOwner: 'a', repoName: 'b', issueNumber: 5 });
    expect(t2.id).toBe(t1.id);
  });

  it('lists threads in id order', () => {
    const a = store.threads.create({ repoOwner: 'r', repoName: 'r', issueNumber: 1 });
    const b = store.threads.create({ repoOwner: 'r', repoName: 'r', issueNumber: 2 });
    const list = store.threads.list();
    expect(list.map((t) => t.id)).toEqual([a.id, b.id]);
  });

  it('findById returns null for missing id', () => {
    expect(store.threads.findById(9999)).toBeNull();
  });
});
