import { describe, expect, it } from 'vitest';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

describe('agent-runs:preview:get', () => {
  it('returns the persisted preview state', async () => {
    const { handlers, store } = makeHandlerTestKit();
    const t = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 1 });
    const run = store.agentRuns.create({ threadId: t.id });
    store.agentRuns.update(run.id, { previewState: 'idle' });
    const result = await handlers['agent-runs:preview:get']({ runId: run.id });
    expect(result.state).toBe('idle');
  });

  it('throws NotFound when the run does not exist', async () => {
    const { handlers } = makeHandlerTestKit();
    await expect(
      handlers['agent-runs:preview:get']({ runId: 9999 }),
    ).rejects.toMatchObject({ name: 'NotFound' });
  });
});
