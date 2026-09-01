import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStoreInMemory, type Store } from '../src/index.js';

describe('PromotionsRepo', () => {
  let store: Store;
  let messageId: number;
  let cardId: number;

  beforeEach(() => {
    store = openStoreInMemory();
    const t = store.threads.create({ repoOwner: 'a', repoName: 'b', issueNumber: 1 });
    messageId = store.messages.create({ threadId: t.id, role: 'agent', body: 'x' }).id;
    cardId = store.cards.create({ messageId, type: 'proposed_diff', payload: {} }).id;
  });

  afterEach(() => {
    store.close();
  });

  it('records a comment promotion', () => {
    const p = store.promotions.create({ kind: 'comment', githubId: 555, messageId });
    expect(p.kind).toBe('comment');
    expect(p.githubId).toBe(555);
    expect(p.messageId).toBe(messageId);
    expect(p.cardId).toBeNull();
  });

  it('records a pull_request promotion', () => {
    const p = store.promotions.create({ kind: 'pull_request', githubId: 87, cardId });
    expect(p.kind).toBe('pull_request');
    expect(p.cardId).toBe(cardId);
    expect(p.messageId).toBeNull();
  });

  it('finds by message', () => {
    const p = store.promotions.create({ kind: 'comment', githubId: 1, messageId });
    expect(store.promotions.findByMessage(messageId)?.id).toBe(p.id);
    expect(store.promotions.findByMessage(99999)).toBeNull();
  });

  it('finds by card', () => {
    const p = store.promotions.create({ kind: 'pull_request', githubId: 5, cardId });
    expect(store.promotions.findByCard(cardId)?.id).toBe(p.id);
  });

  it('returns the most recent promotion per message', () => {
    store.promotions.create({ kind: 'comment', githubId: 1, messageId });
    const second = store.promotions.create({ kind: 'comment', githubId: 2, messageId });
    expect(store.promotions.findByMessage(messageId)?.id).toBe(second.id);
  });
});
