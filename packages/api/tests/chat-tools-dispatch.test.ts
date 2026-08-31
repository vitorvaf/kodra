import { describe, expect, it } from 'vitest';
import { dispatchChatTool } from '../src/chat-tools-dispatch.js';
import { issueFixture } from './helpers/fixtures.js';
import { makeHandlerTestKit } from './helpers/make-handlers.js';

describe('chat tool issue references', () => {
  it('passes a custom id through getIssue', async () => {
    const { handlers, source } = makeHandlerTestKit({ mode: 'local' });
    source.setIssue(issueFixture('FEAT-42', 'feature'));

    const result = await dispatchChatTool('getIssue', { number: 'FEAT-42' }, handlers);

    expect(result).toMatchObject({ issue: { number: 'FEAT-42' } });
  });

  it('passes a custom id through dispatchAgent to the supervisor', async () => {
    const { handlers, source, supervisor } = makeHandlerTestKit({ mode: 'local' });
    source.setIssue(issueFixture('FEAT-42', 'feature'));

    await dispatchChatTool('dispatchAgent', { number: 'FEAT-42' }, handlers);

    expect(supervisor.calls.find((call) => call.type === 'start')?.args).toMatchObject({
      issueNumber: 'FEAT-42',
    });
  });

  it('rejects garbage issue reference types', async () => {
    const { handlers } = makeHandlerTestKit();

    await expect(dispatchChatTool('getIssue', { number: {} }, handlers)).rejects.toThrow(
      "missing or invalid 'number'",
    );
  });
});
