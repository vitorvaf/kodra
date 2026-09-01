import { describe, expect, it } from 'vitest';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

describe('agent-runs:checks:list', () => {
  it('returns an empty list for a run with no checks', async () => {
    const { handlers, store } = makeHandlerTestKit();
    const t = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 1 });
    const run = store.agentRuns.create({ threadId: t.id });
    expect(await handlers['agent-runs:checks:list']({ runId: run.id })).toEqual([]);
  });

  it('rejects a non-positive runId via validation', async () => {
    const { handlers } = makeHandlerTestKit();
    await expect(
      handlers['agent-runs:checks:list']({ runId: 0 }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });
});
