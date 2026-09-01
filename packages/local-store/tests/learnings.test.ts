import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashLearningContent, normaliseLearningContent } from '../src/repos/learnings.js';
import { openStoreInMemory, type Store } from '../src/index.js';

describe('LearningsRepo', () => {
  let store: Store;
  const repoOwner = 'octo';
  const repoName = 'cat';

  beforeEach(() => {
    store = openStoreInMemory();
  });

  afterEach(() => {
    store.close();
  });

  describe('upsertWithDedup', () => {
    it('inserts a new learning with default confidence', () => {
      const { learning, updated } = store.learnings.upsertWithDedup({
        repoOwner,
        repoName,
        tag: 'convention',
        content: 'Tests live next to source files',
      });
      expect(updated).toBe(false);
      expect(learning.tag).toBe('convention');
      expect(learning.confidence).toBe(0.5);
      expect(learning.useCount).toBe(0);
      expect(learning.contentHash).toBe(hashLearningContent('Tests live next to source files'));
    });

    it('dedupes identical content (modulo whitespace/case)', () => {
      const a = store.learnings.upsertWithDedup({
        repoOwner,
        repoName,
        tag: 'convention',
        content: 'Tests live next to source files',
      });
      const b = store.learnings.upsertWithDedup({
        repoOwner,
        repoName,
        tag: 'convention',
        // different whitespace + case → still dedupes via normaliseLearningContent
        content: '  TESTS   live next to   source files  ',
      });
      expect(b.updated).toBe(true);
      expect(b.learning.id).toBe(a.learning.id);
      expect(b.learning.useCount).toBe(1);
    });

    it('keeps separate entries for separate repos', () => {
      const a = store.learnings.upsertWithDedup({
        repoOwner: 'one',
        repoName: 'r',
        tag: 'gotcha',
        content: 'Same wording',
      });
      const b = store.learnings.upsertWithDedup({
        repoOwner: 'two',
        repoName: 'r',
        tag: 'gotcha',
        content: 'Same wording',
      });
      expect(b.updated).toBe(false);
      expect(b.learning.id).not.toBe(a.learning.id);
    });

    it('on dedup hit, lifts confidence to the higher value', () => {
      const a = store.learnings.upsertWithDedup({
        repoOwner,
        repoName,
        tag: 'fragile',
        content: 'Migrations must run in order',
        confidence: 0.4,
      });
      expect(a.learning.confidence).toBeCloseTo(0.4);
      const b = store.learnings.upsertWithDedup({
        repoOwner,
        repoName,
        tag: 'fragile',
        content: 'Migrations must run in order',
        confidence: 0.9,
      });
      expect(b.updated).toBe(true);
      expect(b.learning.confidence).toBeCloseTo(0.9);
    });
  });

  describe('listForInjection', () => {
    function seed(content: string, opts: { pinned?: boolean; confidence?: number } = {}): void {
      const r = store.learnings.upsertWithDedup({
        repoOwner,
        repoName,
        tag: 'convention',
        content,
        ...(typeof opts.confidence === 'number' ? { confidence: opts.confidence } : {}),
      });
      if (opts.pinned) store.learnings.pin(r.learning.id, true);
    }

    it('orders pinned ahead of unpinned', () => {
      seed('low priority unpinned', { confidence: 0.1 });
      seed('high priority unpinned', { confidence: 0.9 });
      seed('pinned even though low confidence', { pinned: true, confidence: 0.2 });
      const out = store.learnings.listForInjection({ repoOwner, repoName });
      expect(out[0]?.content).toContain('pinned');
    });

    it('respects token budget by truncation', () => {
      // Each entry is ~30 chars → ~7-8 tokens. 4-token budget = ~16 chars,
      // which can't fit any single entry (each needs at minimum content + 16
      // framing chars). Expect zero results.
      seed('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      seed('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
      const out = store.learnings.listForInjection({ repoOwner, repoName, tokenBudget: 4 });
      expect(out).toHaveLength(0);
    });

    it('skips soft-deleted entries', () => {
      const r = store.learnings.upsertWithDedup({
        repoOwner,
        repoName,
        tag: 'gotcha',
        content: 'Will be deleted',
      });
      store.learnings.softDelete(r.learning.id);
      const out = store.learnings.listForInjection({ repoOwner, repoName });
      expect(out).toHaveLength(0);
    });
  });

  describe('curator budget', () => {
    it('attributes spend and resets on date change', () => {
      const t1 = store.learnings.attributeCuratorSpend(repoOwner, repoName, 0.02);
      expect(t1).toBeCloseTo(0.02);
      const t2 = store.learnings.attributeCuratorSpend(repoOwner, repoName, 0.03);
      expect(t2).toBeCloseTo(0.05);
      // Force the stored date to be yesterday — the next attribution should
      // reset and just store today's value.
      store.db
        .prepare('UPDATE curator_run_state SET spent_date = ? WHERE repo_owner = ?')
        .run('1999-01-01', repoOwner);
      const t3 = store.learnings.attributeCuratorSpend(repoOwner, repoName, 0.04);
      expect(t3).toBeCloseTo(0.04);
    });

    it('respects daily budget cap when set', () => {
      store.learnings.setCuratorDailyBudget(repoOwner, repoName, 0.10);
      const state = store.learnings.getCuratorState(repoOwner, repoName);
      expect(state?.dailyBudgetUsd).toBeCloseTo(0.10);
    });
  });

  describe('pin/softDelete/updateContent', () => {
    it('pins and unpins', () => {
      const r = store.learnings.upsertWithDedup({
        repoOwner,
        repoName,
        tag: 'gotcha',
        content: 'something',
      });
      const pinned = store.learnings.pin(r.learning.id, true);
      expect(pinned.pinned).toBe(true);
      const unpinned = store.learnings.pin(r.learning.id, false);
      expect(unpinned.pinned).toBe(false);
    });

    it('updateContent rehashes', () => {
      const r = store.learnings.upsertWithDedup({
        repoOwner,
        repoName,
        tag: 'gotcha',
        content: 'old',
      });
      const updated = store.learnings.updateContent(r.learning.id, 'new content');
      expect(updated.content).toBe('new content');
      expect(updated.contentHash).toBe(hashLearningContent('new content'));
    });
  });

  describe('helpers', () => {
    it('normaliseLearningContent strips whitespace and lowercases', () => {
      expect(normaliseLearningContent('  HELLO   World  ')).toBe('hello world');
    });
  });
});
