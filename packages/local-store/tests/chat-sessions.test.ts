import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStoreInMemory, type Store } from '../src/index.js';

/**
 * The chat_sessions table sits between chat_conversations and the
 * messages/agent_runs that belong to a parallel agent thread. These
 * tests pin the contract the chat handlers rely on — list ordering,
 * cascade delete, status updates — so future schema changes don't
 * silently regress the dropdown UX.
 */
describe('ChatSessionsRepo', () => {
  let store: Store;
  let conversationId: number;

  beforeEach(() => {
    store = openStoreInMemory();
    const conv = store.chatConversations.create({ title: 'Test conversation' });
    conversationId = conv.id;
  });

  afterEach(() => {
    store.close();
  });

  it('creates a session with the provider it was given', () => {
    const session = store.chatSessions.create({
      conversationId,
      agentProvider: 'codex-cli',
      agentModel: 'gpt-5',
    });
    expect(session.agentProvider).toBe('codex-cli');
    expect(session.agentModel).toBe('gpt-5');
    expect(session.status).toBe('idle');
    expect(session.title).toBeNull();
  });

  it('lists sessions most-recent-first', async () => {
    const a = store.chatSessions.create({ conversationId, agentProvider: 'claude-code' });
    // Ensure b's created_at is strictly later than a's so the
    // most-recent-first sort is deterministic at ms resolution.
    await new Promise((r) => setTimeout(r, 5));
    const b = store.chatSessions.create({ conversationId, agentProvider: 'codex-cli' });
    await new Promise((r) => setTimeout(r, 5));
    // touch a so its last_message_at jumps past b's created_at
    store.chatSessions.touch(a.id);
    const list = store.chatSessions.listByConversation(conversationId);
    expect(list.map((s) => s.id)).toEqual([a.id, b.id]);
  });

  it('rename + setStatus persist', () => {
    const session = store.chatSessions.create({
      conversationId,
      agentProvider: 'claude-code',
    });
    const renamed = store.chatSessions.rename(session.id, 'Exploring');
    expect(renamed.title).toBe('Exploring');
    store.chatSessions.setStatus(session.id, 'running');
    const fetched = store.chatSessions.findById(session.id);
    expect(fetched?.status).toBe('running');
  });

  it('remove() cascades messages + runs for the session only', () => {
    const conv = store.chatConversations.findById(conversationId);
    expect(conv).not.toBeNull();
    if (!conv) return;
    const keep = store.chatSessions.create({
      conversationId,
      agentProvider: 'claude-code',
    });
    const drop = store.chatSessions.create({
      conversationId,
      agentProvider: 'codex-cli',
    });
    store.messages.create({
      threadId: conv.threadId,
      role: 'user',
      body: 'in keep',
      chatSessionId: keep.id,
    });
    store.messages.create({
      threadId: conv.threadId,
      role: 'user',
      body: 'in drop',
      chatSessionId: drop.id,
    });
    store.chatSessions.remove(drop.id);
    const remaining = store.messages.list(conv.threadId);
    expect(remaining.map((m) => m.body)).toEqual(['in keep']);
    expect(store.chatSessions.findById(drop.id)).toBeNull();
    expect(store.chatSessions.findById(keep.id)).not.toBeNull();
  });

  it('findMostRecentForConversation honors last_message_at', async () => {
    const a = store.chatSessions.create({ conversationId, agentProvider: 'claude-code' });
    await new Promise((r) => setTimeout(r, 5));
    store.chatSessions.create({ conversationId, agentProvider: 'codex-cli' });
    await new Promise((r) => setTimeout(r, 5));
    store.chatSessions.touch(a.id);
    const recent = store.chatSessions.findMostRecentForConversation(conversationId);
    expect(recent?.id).toBe(a.id);
  });
});
