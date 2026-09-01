import { describe, expect, it } from 'vitest';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

describe('agent-runs:get', () => {
  it('returns the run when it exists', async () => {
    const { handlers, store } = makeHandlerTestKit();
    const t = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 1 });
    const run = store.agentRuns.create({ threadId: t.id });
    const result = await handlers['agent-runs:get']({ runId: run.id });
    expect(result.id).toBe(run.id);
  });

  it('throws NotFound when the run does not exist', async () => {
    const { handlers } = makeHandlerTestKit();
    await expect(handlers['agent-runs:get']({ runId: 9999 })).rejects.toMatchObject({
      name: 'NotFound',
    });
  });
});

describe('agent-runs:stop', () => {
  it('marks the run as stopped via the supervisor', async () => {
    const { handlers, store, supervisor } = makeHandlerTestKit();
    const t = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 1 });
    const run = store.agentRuns.create({ threadId: t.id });
    store.agentRuns.update(run.id, { status: 'running' });
    const result = await handlers['agent-runs:stop']({ runId: run.id });
    expect(result.status).toBe('stopped');
    expect(supervisor.calls.some((c) => c.type === 'stop')).toBe(true);
  });
});
