import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStoreInMemory, type Store } from '../src/index.js';

describe('AgentEventsRepo', () => {
  let store: Store;
  let runId: number;

  beforeEach(() => {
    store = openStoreInMemory();
    const t = store.threads.create({ repoOwner: 'a', repoName: 'b', issueNumber: 1 });
    runId = store.agentRuns.create({ threadId: t.id }).id;
  });

  afterEach(() => {
    store.close();
  });

  it('appends with auto-incrementing seq starting at 0', () => {
    const e1 = store.events.append({
      agentRunId: runId,
      type: 'text',
      payload: { content: 'hi' },
    });
    const e2 = store.events.append({
      agentRunId: runId,
      type: 'tool_use',
      payload: { tool: 'Read', path: '/x' },
    });
    expect(e1.seq).toBe(0);
    expect(e2.seq).toBe(1);
  });

  it('lists in seq order', () => {
    store.events.append({ agentRunId: runId, type: 'text', payload: { i: 1 } });
    store.events.append({ agentRunId: runId, type: 'text', payload: { i: 2 } });
    store.events.append({ agentRunId: runId, type: 'text', payload: { i: 3 } });
    const list = store.events.list(runId);
    expect(list.map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it('filters by afterSeq for incremental fetch', () => {
    store.events.append({ agentRunId: runId, type: 'text', payload: {} });
    store.events.append({ agentRunId: runId, type: 'text', payload: {} });
    store.events.append({ agentRunId: runId, type: 'text', payload: {} });
    expect(store.events.list(runId, { afterSeq: 0 })).toHaveLength(2);
    expect(store.events.list(runId, { afterSeq: 2 })).toHaveLength(0);
  });

  it('isolates seq per agent run', () => {
    const t = store.threads.create({ repoOwner: 'x', repoName: 'y', issueNumber: 2 });
    const otherRunId = store.agentRuns.create({ threadId: t.id }).id;

    store.events.append({ agentRunId: runId, type: 'text', payload: {} });
    store.events.append({ agentRunId: runId, type: 'text', payload: {} });
    const e = store.events.append({ agentRunId: otherRunId, type: 'text', payload: {} });
    expect(e.seq).toBe(0);
  });

  it('round-trips JSON payloads', () => {
    const payload = { tool: 'Bash', input: { cmd: 'ls -la', cwd: '/tmp' } };
    const e = store.events.append({ agentRunId: runId, type: 'tool_use', payload });
    const fetched = store.events.list(runId)[0];
    expect(fetched?.payload).toEqual(payload);
    expect(fetched?.id).toBe(e.id);
  });

  it('appendMany preserves FIFO order and contiguous seqs', () => {
    const inputs = [
      { agentRunId: runId, type: 'text' as const, payload: { i: 1 } },
      { agentRunId: runId, type: 'tool_use' as const, payload: { i: 2 } },
      { agentRunId: runId, type: 'text' as const, payload: { i: 3 } },
    ];
    const appended = store.events.appendMany(inputs);

    expect(appended.map((event) => event.seq)).toEqual([0, 1, 2]);
    expect(appended.map((event) => [event.type, event.payload])).toEqual(
      inputs.map((input) => [input.type, input.payload]),
    );
    expect(store.events.list(runId).map((event) => event.seq)).toEqual([0, 1, 2]);
  });

  it('classifies event and data writes separately, including mixed writes', () => {
    const initial = store.getOwnWriteRevisions();
    store.events.append({ agentRunId: runId, type: 'text', payload: { kind: 'event' } });
    const afterEvent = store.getOwnWriteRevisions();
    expect(afterEvent.events).toBeGreaterThan(initial.events);
    expect(afterEvent.data).toBe(initial.data);

    store.messages.create({ threadId: 1, role: 'user', body: 'cold data' });
    const afterData = store.getOwnWriteRevisions();
    expect(afterData.data).toBeGreaterThan(afterEvent.data);

    store.events.appendMany([{ agentRunId: runId, type: 'text', payload: { kind: 'mixed' } }]);
    store.messages.create({ threadId: 1, role: 'user', body: 'mixed data' });
    const afterMixed = store.getOwnWriteRevisions();
    expect(afterMixed.events).toBeGreaterThan(afterData.events);
    expect(afterMixed.data).toBeGreaterThan(afterData.data);
  });
});
