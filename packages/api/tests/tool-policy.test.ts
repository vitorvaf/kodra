import { afterEach, describe, expect, it } from 'vitest';
import { dispatchChatTool } from '../src/chat-tools-dispatch.js';
import { startToolBridge, type ToolBridge } from '../src/tool-bridge.js';
import { assertToolAllowed, ToolPermissionError, type ToolCaller } from '../src/tool-policy.js';
import { issueFixture } from './helpers/fixtures.js';
import { makeHandlerTestKit } from './helpers/make-handlers.js';

const card7: ToolCaller = { kind: 'card', issueNumber: 7 };

describe('assertToolAllowed', () => {
  it('lets the chat agent and in-process calls use every tool', () => {
    expect(() => assertToolAllowed('dispatchAgent', { number: 1 }, { kind: 'chat' })).not.toThrow();
    expect(() => assertToolAllowed('archiveIssue', { number: 1 }, undefined)).not.toThrow();
  });

  it('lets a card agent read the board and file new cards', () => {
    for (const name of ['listIssues', 'getIssue', 'listAgentRuns', 'listPendingDecisions']) {
      expect(() => assertToolAllowed(name, { number: 99 }, card7)).not.toThrow();
    }
    expect(() => assertToolAllowed('createIssue', { title: 'bug' }, card7)).not.toThrow();
  });

  it('lets a card agent change its own card', () => {
    expect(() => assertToolAllowed('updateIssue', { number: 7 }, card7)).not.toThrow();
    expect(() => assertToolAllowed('moveIssueStatus', { number: '7' }, card7)).not.toThrow();
    expect(() =>
      assertToolAllowed('splitIssue', { number: 7, subtasks: [{ title: 'a' }] }, card7),
    ).not.toThrow();
  });

  it('matches custom card ids', () => {
    const caller: ToolCaller = { kind: 'card', issueNumber: 'FEAT-42' };
    expect(() => assertToolAllowed('updateIssue', { number: 'FEAT-42' }, caller)).not.toThrow();
    expect(() => assertToolAllowed('updateIssue', { number: 'FEAT-43' }, caller)).toThrow(
      ToolPermissionError,
    );
  });

  it('blocks a card agent from changing other cards', () => {
    expect(() => assertToolAllowed('updateIssue', { number: 8 }, card7)).toThrow(
      'can only change its own card',
    );
    expect(() => assertToolAllowed('moveIssueStatus', {}, card7)).toThrow(ToolPermissionError);
  });

  it('blocks a card agent from dispatching agents through splitIssue', () => {
    expect(() =>
      assertToolAllowed('splitIssue', { number: 7, subtasks: [], dispatch: true }, card7),
    ).toThrow('cannot dispatch agents');
  });

  it('blocks control tools and unknown tools for card agents', () => {
    for (const name of [
      'dispatchAgent',
      'stopAgentRun',
      'resolvePendingDecision',
      'archiveIssue',
      'pinLearning',
      'deleteLearning',
      'updateLearning',
      'somethingNew',
    ]) {
      expect(() => assertToolAllowed(name, { number: 7 }, card7)).toThrow(ToolPermissionError);
    }
  });
});

describe('dispatchChatTool with a card caller', () => {
  it('refuses before any handler runs', async () => {
    const { handlers, source, supervisor } = makeHandlerTestKit({ mode: 'local' });
    source.setIssue(issueFixture(8, 'feature'));

    await expect(dispatchChatTool('dispatchAgent', { number: 8 }, handlers, card7)).rejects.toThrow(
      ToolPermissionError,
    );
    expect(supervisor.calls.find((call) => call.type === 'start')).toBeUndefined();
  });
});

describe('tool bridge', () => {
  let bridge: ToolBridge | null = null;

  afterEach(async () => {
    await bridge?.close();
    bridge = null;
  });

  async function call(token: string, tool: string, body: unknown): Promise<Response> {
    return fetch(`${bridge!.baseUrl()}/tool/${tool}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('hands the caller bound to the token to the dispatcher', async () => {
    const seen: Array<ToolCaller | undefined> = [];
    const { handlers } = makeHandlerTestKit();
    bridge = await startToolBridge({
      handlers,
      dispatch: async (_name, _args, _handlers, caller) => {
        seen.push(caller);
        return { ok: true };
      },
    });
    const cardToken = bridge.issueToken(card7);
    const chatToken = bridge.issueToken({ kind: 'chat' });

    expect((await call(cardToken, 'listIssues', {})).status).toBe(200);
    expect((await call(chatToken, 'listIssues', {})).status).toBe(200);
    expect(seen).toEqual([card7, { kind: 'chat' }]);
  });

  it('answers 403 for a permission error and 401 for a revoked token', async () => {
    const { handlers } = makeHandlerTestKit();
    bridge = await startToolBridge({ handlers, dispatch: dispatchChatTool });
    const token = bridge.issueToken(card7);

    const denied = await call(token, 'dispatchAgent', { number: 8 });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: expect.stringContaining('dispatchAgent') });

    bridge.revokeToken(token);
    expect((await call(token, 'listIssues', {})).status).toBe(401);
  });
});
