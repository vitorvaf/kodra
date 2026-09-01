import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStoreInMemory, type Store } from '../src/index.js';

describe('MessagesRepo', () => {
  let store: Store;
  let threadId: number;

  beforeEach(() => {
    store = openStoreInMemory();
    threadId = store.threads.create({ repoOwner: 'a', repoName: 'b', issueNumber: 1 }).id;
  });

  afterEach(() => {
    store.close();
  });

  it('creates and lists messages in order', () => {
    const m1 = store.messages.create({ threadId, role: 'user', body: 'hello' });
    const m2 = store.messages.create({ threadId, role: 'agent', body: 'hi' });
    const list = store.messages.list(threadId);
    expect(list.map((m) => m.id)).toEqual([m1.id, m2.id]);
    expect(list[0]?.body).toBe('hello');
    expect(list[1]?.role).toBe('agent');
  });

  it('starts unpromoted with null timestamps', () => {
    const m = store.messages.create({ threadId, role: 'agent', body: 'x' });
    expect(m.promotedGithubCommentId).toBeNull();
    expect(m.promotedAt).toBeNull();
    expect(m.agentRunId).toBeNull();
  });

  it('persists agentRunId when provided', () => {
    const run = store.agentRuns.create({ threadId });
    const m = store.messages.create({
      threadId,
      role: 'agent',
      body: 'output',
      agentRunId: run.id,
    });
    const fetched = store.messages.findById(m.id);
    expect(fetched?.agentRunId).toBe(run.id);
  });

  it('marks promoted', () => {
    const m = store.messages.create({ threadId, role: 'agent', body: 'x' });
    const promoted = store.messages.markPromoted(m.id, 12345);
    expect(promoted.promotedGithubCommentId).toBe(12345);
    expect(promoted.promotedAt).toBeTruthy();
  });

  it('rejects messages on missing thread (FK)', () => {
    expect(() => store.messages.create({ threadId: 9999, role: 'user', body: 'x' })).toThrow();
  });

  it('returns empty array for thread with no messages', () => {
    expect(store.messages.list(threadId)).toEqual([]);
  });
});
