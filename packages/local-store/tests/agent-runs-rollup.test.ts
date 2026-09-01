import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStoreInMemory, type Store } from '../src/index.js';
import type { SuccessSignal } from '../src/types.js';

interface SeedSpec {
  personaId: string;
  model: string;
  cost: number;
  signal: SuccessSignal;
  cardKind?: string;
}

function seedRun(store: Store, threadId: number, spec: SeedSpec): number {
  const run = store.agentRuns.create({ threadId });
  store.agentRuns.update(run.id, {
    personaId: spec.personaId,
    model: spec.model,
    provider: 'claude-code',
    totalCostUsd: spec.cost,
    durationMs: 60_000,
    successSignal: spec.signal,
    ...(spec.cardKind ? { cardKind: spec.cardKind } : {}),
  });
  return run.id;
}

describe('AgentRunsRepo analytics queries', () => {
  let store: Store;
  let threadId: number;

  beforeEach(() => {
    store = openStoreInMemory();
    threadId = store.threads.create({ repoOwner: 'octo', repoName: 'cat', issueNumber: 1 }).id;
  });

  afterEach(() => {
    store.close();
  });

  describe('personaModelRollup', () => {
    it('groups by (persona, model) and computes success rate', () => {
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.30, signal: 'completed_clean' });
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.32, signal: 'completed_clean' });
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.40, signal: 'failed' });
      seedRun(store, threadId, { personaId: 'eng', model: 'opus', cost: 1.20, signal: 'promoted' });
      seedRun(store, threadId, { personaId: 'pm', model: 'sonnet', cost: 0.10, signal: 'completed_clean' });

      const rollup = store.agentRuns.personaModelRollup();
      const eng_sonnet = rollup.find((r) => r.personaId === 'eng' && r.model === 'sonnet');
      const eng_opus = rollup.find((r) => r.personaId === 'eng' && r.model === 'opus');
      const pm_sonnet = rollup.find((r) => r.personaId === 'pm' && r.model === 'sonnet');

      expect(eng_sonnet?.runs).toBe(3);
      expect(eng_sonnet?.successes).toBe(2);
      expect(eng_sonnet?.failures).toBe(1);
      expect(eng_sonnet?.successRate).toBeCloseTo(2 / 3);
      expect(eng_sonnet?.totalCostUsd).toBeCloseTo(1.02);

      expect(eng_opus?.runs).toBe(1);
      expect(eng_opus?.successes).toBe(1);
      expect(eng_opus?.successRate).toBe(1);

      expect(pm_sonnet?.runs).toBe(1);
    });

    it('excludes runs without persona_id', () => {
      // Chat run / non-autopilot dispatch — no persona.
      const r = store.agentRuns.create({ threadId });
      store.agentRuns.update(r.id, {
        model: 'sonnet',
        successSignal: 'completed_clean',
        totalCostUsd: 0.10,
      });
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.20, signal: 'completed_clean' });
      const rollup = store.agentRuns.personaModelRollup();
      expect(rollup).toHaveLength(1);
      expect(rollup[0]?.personaId).toBe('eng');
    });

    it('filters by card kind', () => {
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.10, signal: 'completed_clean', cardKind: 'feat' });
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.20, signal: 'completed_clean', cardKind: 'bug' });
      const featOnly = store.agentRuns.personaModelRollup({ cardKind: 'feat' });
      expect(featOnly).toHaveLength(1);
      expect(featOnly[0]?.runs).toBe(1);
    });
  });

  describe('frontierData', () => {
    it('drops combos with too few runs', () => {
      // 2 runs of eng/sonnet, 6 of pm/sonnet
      for (let i = 0; i < 2; i++) {
        seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.10, signal: 'completed_clean' });
      }
      for (let i = 0; i < 6; i++) {
        seedRun(store, threadId, { personaId: 'pm', model: 'sonnet', cost: 0.10, signal: 'completed_clean' });
      }
      const frontier = store.agentRuns.frontierData({ minRuns: 5 });
      expect(frontier).toHaveLength(1);
      expect(frontier[0]?.personaId).toBe('pm');
    });
  });

  describe('routerCandidates', () => {
    it('produces Beta(α, β) priors via successes+1 / failures+1', () => {
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.10, signal: 'completed_clean' });
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.10, signal: 'completed_clean' });
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.10, signal: 'failed' });
      const cand = store.agentRuns.routerCandidates();
      expect(cand).toHaveLength(1);
      expect(cand[0]?.alpha).toBe(3); // 2 successes + 1
      expect(cand[0]?.beta).toBe(2); // 1 failure + 1
    });
  });

  describe('costTimeSeries', () => {
    it('buckets daily and computes cost + success rate per day', () => {
      // Override started_at on these rows so we test the bucket computation
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.10, signal: 'completed_clean' });
      seedRun(store, threadId, { personaId: 'eng', model: 'sonnet', cost: 0.20, signal: 'completed_clean' });
      // Set the second run to a different day.
      const allRows = store.db
        .prepare('SELECT id FROM agent_runs ORDER BY id')
        .all() as { id: number }[];
      store.db
        .prepare("UPDATE agent_runs SET started_at = '2025-01-01T00:00:00.000Z' WHERE id = ?")
        .run(allRows[0]?.id);
      store.db
        .prepare("UPDATE agent_runs SET started_at = '2025-01-02T00:00:00.000Z' WHERE id = ?")
        .run(allRows[1]?.id);

      const ts = store.agentRuns.costTimeSeries({
        sinceTs: '2024-01-01T00:00:00Z',
      });
      expect(ts).toHaveLength(2);
      expect(ts[0]?.bucketDate).toBe('2025-01-01');
      expect(ts[0]?.totalCostUsd).toBeCloseTo(0.10);
      expect(ts[1]?.bucketDate).toBe('2025-01-02');
      expect(ts[1]?.totalCostUsd).toBeCloseTo(0.20);
    });
  });
});
