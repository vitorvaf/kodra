import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CardAlreadyResolvedError, openStoreInMemory, type Store } from '../src/index.js';

describe('CardsRepo', () => {
  let store: Store;
  let messageId: number;

  beforeEach(() => {
    store = openStoreInMemory();
    const t = store.threads.create({ repoOwner: 'a', repoName: 'b', issueNumber: 1 });
    messageId = store.messages.create({ threadId: t.id, role: 'agent', body: 'x' }).id;
  });

  afterEach(() => {
    store.close();
  });

  it('creates a pending card', () => {
    const c = store.cards.create({
      messageId,
      type: 'decision',
      payload: { prompt: 'pick', options: [{ id: 'a' }, { id: 'b' }] },
    });
    expect(c.status).toBe('pending');
    expect((c.payload as { prompt: string }).prompt).toBe('pick');
    expect(c.resolvedValue).toBeNull();
    expect(c.resolvedAt).toBeNull();
  });

  it('round-trips JSON payload', () => {
    const payload = {
      nested: { array: [1, 2, 3], bool: true, n: null },
      string: 'with "quotes" and \n newlines',
    };
    const c = store.cards.create({ messageId, type: 'result', payload });
    const got = store.cards.findById(c.id);
    expect(got?.payload).toEqual(payload);
  });

  it('resolves and stores resolved value', () => {
    const c = store.cards.create({ messageId, type: 'decision', payload: {} });
    const resolved = store.cards.resolve(c.id, { chosen: 'a' });
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedValue).toEqual({ chosen: 'a' });
    expect(resolved.resolvedAt).toBeTruthy();
  });

  it('throws CardAlreadyResolvedError on double resolve', () => {
    const c = store.cards.create({ messageId, type: 'decision', payload: {} });
    store.cards.resolve(c.id, { chosen: 'a' });
    expect(() => store.cards.resolve(c.id, { chosen: 'b' })).toThrow(CardAlreadyResolvedError);
  });

  it('throws on resolve of dismissed card', () => {
    const c = store.cards.create({ messageId, type: 'confirmation', payload: {} });
    store.cards.dismiss(c.id);
    expect(() => store.cards.resolve(c.id, true)).toThrow(CardAlreadyResolvedError);
  });

  it('dismisses a pending card', () => {
    const c = store.cards.create({ messageId, type: 'confirmation', payload: {} });
    const d = store.cards.dismiss(c.id);
    expect(d.status).toBe('dismissed');
  });

  it('lists by message in id order', () => {
    const a = store.cards.create({ messageId, type: 'decision', payload: { i: 1 } });
    const b = store.cards.create({ messageId, type: 'result', payload: { i: 2 } });
    const list = store.cards.listByMessage(messageId);
    expect(list.map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it('throws on resolve of unknown card', () => {
    expect(() => store.cards.resolve(9999, {})).toThrow(/not found/);
  });
});
