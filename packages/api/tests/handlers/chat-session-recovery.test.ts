import { describe, expect, it } from 'vitest';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

function makeChatSession(provider: 'claude-code' | 'agy-cli' = 'claude-code') {
  const kit = makeHandlerTestKit();
  const conversation = kit.store.chatConversations.create({ title: 'Recovery chat' });
  const session = kit.store.chatSessions.create({
    conversationId: conversation.id,
    agentProvider: provider,
  });
  return { ...kit, conversation, session };
}

describe('chat session recovery', () => {
  it('grafts an older same-provider session onto the latest dead run', async () => {
    const { handlers, store, supervisor, conversation, session } = makeChatSession();
    const older = store.agentRuns.create({ threadId: conversation.threadId, chatSessionId: session.id });
    store.agentRuns.update(older.id, {
      provider: 'claude-code',
      sessionId: 'claude-session',
      status: 'failed',
    });
    const latest = store.agentRuns.create({ threadId: conversation.threadId, chatSessionId: session.id });
    store.agentRuns.update(latest.id, { provider: 'claude-code', status: 'failed' });

    await handlers['chat:post-message']({ conversationId: conversation.id, body: 'continue' });

    expect(store.agentRuns.findById(latest.id)?.sessionId).toBe('claude-session');
    expect(supervisor.calls.at(-1)).toMatchObject({
      type: 'resume',
      args: expect.objectContaining({ runId: latest.id, prompt: 'continue' }),
    });
    const resumeArgs = supervisor.calls.at(-1)?.args as { appendSystemPrompt?: string };
    expect(resumeArgs.appendSystemPrompt).not.toContain('SESSION_RECOVERY');
  });

  it('resumes the provider-matching older row instead of crossing providers', async () => {
    const { handlers, store, supervisor, conversation, session } = makeChatSession('agy-cli');
    const older = store.agentRuns.create({ threadId: conversation.threadId, chatSessionId: session.id });
    store.agentRuns.update(older.id, { provider: 'agy-cli', sessionId: 'agy-session', status: 'failed' });
    const latest = store.agentRuns.create({ threadId: conversation.threadId, chatSessionId: session.id });
    store.agentRuns.update(latest.id, { provider: 'claude-code', status: 'failed' });

    await handlers['chat:post-message']({ conversationId: conversation.id, body: 'continue' });

    expect(supervisor.calls.at(-1)).toMatchObject({
      type: 'resume',
      args: expect.objectContaining({ runId: older.id, prompt: 'continue' }),
    });
    expect(store.agentRuns.findById(latest.id)?.sessionId).toBeNull();
  });

  it('starts a new run when no resumable session exists', async () => {
    const { handlers, store, supervisor, conversation, session } = makeChatSession();
    const latest = store.agentRuns.create({ threadId: conversation.threadId, chatSessionId: session.id });
    store.agentRuns.update(latest.id, { provider: 'claude-code', status: 'failed' });

    await handlers['chat:post-message']({ conversationId: conversation.id, body: 'start over' });

    expect(supervisor.calls.at(-1)).toMatchObject({
      type: 'start',
      args: expect.objectContaining({ prompt: 'start over' }),
    });
    const startArgs = supervisor.calls.at(-1)?.args as { appendSystemPrompt?: string };
    expect(startArgs.appendSystemPrompt).toContain('SESSION_RECOVERY');
    expect(startArgs.appendSystemPrompt).toContain('[user] start over');
  });

  it('does not inject recovery context for a brand-new session', async () => {
    const { handlers, supervisor, conversation } = makeChatSession();

    await handlers['chat:post-message']({ conversationId: conversation.id, body: 'fresh start' });

    const startArgs = supervisor.calls.at(-1)?.args as { appendSystemPrompt?: string };
    expect(startArgs.appendSystemPrompt).not.toContain('SESSION_RECOVERY');
  });
});
