import { openStoreInMemory, type Store } from '@kanbots/local-store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentSupervisor } from '../src/agent-runs/supervisor.js';
import type { SuggestFeatureFn } from '../src/bridge.js';
import { createAutopilotManager, type AutopilotManager } from '../src/autopilot/orchestrator.js';
import { FakeIssueSource, makeStubSupervisor } from './helpers/fakes.js';
import { issueFixture } from './helpers/fixtures.js';

const config = {
  kind: 'feature-dev' as const,
  personas: [{ id: 'builtin:pm', name: 'Product Manager', prompt: 'You are a PM.' }],
  parallelism: 1,
};

describe('autopilot session card', () => {
  let store: Store;
  let manager: AutopilotManager | null = null;

  afterEach(async () => {
    await manager?.stopAllForShutdown();
    manager = null;
    store?.close();
  });

  function build(source: FakeIssueSource, suggestIssue: SuggestFeatureFn): AutopilotManager {
    manager = createAutopilotManager({
      store,
      source,
      supervisor: makeStubSupervisor(store) as unknown as AgentSupervisor,
      suggestIssue,
      repoPath: '/repo',
      repoConfig: { owner: 'local', repo: 'repo' },
    });
    return manager;
  }

  it('moves the card to todo and marks it failed when the session fails', async () => {
    store = openStoreInMemory();
    const source = new FakeIssueSource();
    const ap = build(source, async () => {
      throw new Error('spawn gemini ENOENT');
    });

    const { session, issueNumber } = await ap.start({ kind: 'feature-dev', config });

    await vi.waitFor(
      async () => {
        expect((await source.getIssue(issueNumber)).labels).toEqual(
          expect.arrayContaining(['status:todo', 'agent:failed']),
        );
      },
      { timeout: 8000 },
    );
    expect(ap.getSession(session.id)?.status).toBe('failed');
    expect((await source.getIssue(issueNumber)).labels).not.toContain('status:in-progress');
    // The loop pauses 500ms between its five failed iterations.
  }, 15_000);

  it('moves the card to todo when the user stops the session', async () => {
    store = openStoreInMemory();
    const source = new FakeIssueSource();
    const ap = build(source, () => new Promise(() => undefined));

    const { session, issueNumber } = await ap.start({ kind: 'feature-dev', config });
    await ap.stop(session.id, { stopChildren: false });

    await vi.waitFor(async () => {
      expect((await source.getIssue(issueNumber)).labels).toEqual(
        expect.arrayContaining(['status:todo', 'agent:idle']),
      );
    });
  });

  it('moves the cards of sessions cut by an app restart', async () => {
    store = openStoreInMemory();
    const source = new FakeIssueSource();
    source.setIssue({
      ...issueFixture(2, 'autopilot'),
      labels: ['type:autopilot', 'subtype:feature-dev', 'status:in-progress'],
    });
    const orphan = store.autopilotSessions.create({ issueNumber: 2, kind: 'feature-dev', config });

    build(source, async () => {
      throw new Error('unused');
    });

    expect(store.autopilotSessions.findById(orphan.id)?.status).toBe('stopped');
    await vi.waitFor(async () => {
      expect((await source.getIssue(2)).labels).toEqual(
        expect.arrayContaining(['status:todo', 'agent:idle']),
      );
    });
  });
});
