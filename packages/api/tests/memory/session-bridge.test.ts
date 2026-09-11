import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentMemorySessionBridge,
  memoryCardSessionId,
  memoryChatSessionId,
} from '../../src/memory/session-bridge.js';

type BridgeClient = Parameters<typeof createAgentMemorySessionBridge>[0]['client'];

const enabled = { enabled: true };

function makeBridge(config: { enabled: boolean } = enabled): {
  bridge: ReturnType<typeof createAgentMemorySessionBridge>;
  sessionStart: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  sessionEnd: ReturnType<typeof vi.fn>;
} {
  const sessionStart = vi.fn().mockResolvedValue(true);
  const observe = vi.fn().mockResolvedValue(true);
  const sessionEnd = vi.fn().mockResolvedValue(true);
  const client: BridgeClient = { sessionStart, observe, sessionEnd };
  return {
    bridge: createAgentMemorySessionBridge({ client, getConfig: () => config }),
    sessionStart,
    observe,
    sessionEnd,
  };
}

describe('agent memory session bridge', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing while memory is disabled', async () => {
    const { bridge, sessionStart, observe, sessionEnd } = makeBridge({ enabled: false });

    bridge.startChatSession({ chatSessionId: 4, project: 'project', cwd: '/tmp/work' });
    bridge.observeChat({
      chatSessionId: 4,
      project: 'project',
      cwd: '/tmp/work',
      hookType: 'agent_run_started',
    });
    bridge.endChatSession(4);
    await Promise.resolve();

    expect(sessionStart).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(sessionEnd).not.toHaveBeenCalled();
  });

  it('starts a chat session only once per id and starts it again after ending', async () => {
    const { bridge, sessionStart, sessionEnd } = makeBridge();

    bridge.startChatSession({
      chatSessionId: 12,
      project: 'project',
      cwd: '/tmp/work',
      title: 'Task',
    });
    bridge.startChatSession({
      chatSessionId: 12,
      project: 'project',
      cwd: '/tmp/work',
      title: 'Duplicate',
    });
    await vi.waitFor(() => expect(sessionStart).toHaveBeenCalledTimes(1));
    expect(sessionStart).toHaveBeenCalledWith({
      sessionId: memoryChatSessionId(12),
      project: 'project',
      cwd: '/tmp/work',
      title: 'Task',
    });

    bridge.endChatSession(12);
    await vi.waitFor(() => expect(sessionEnd).toHaveBeenCalledWith(memoryChatSessionId(12)));
    bridge.startChatSession({ chatSessionId: 12, project: 'project', cwd: '/tmp/work' });
    await vi.waitFor(() => expect(sessionStart).toHaveBeenCalledTimes(2));
  });

  it('observes chat hooks with the deterministic session and lifecycle fields', async () => {
    const { bridge, observe } = makeBridge();

    bridge.observeChat({
      chatSessionId: 7,
      project: 'project',
      cwd: '/tmp/work',
      hookType: 'agent_run_started',
      data: { runId: 3 },
    });
    await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(1));

    expect(observe).toHaveBeenCalledWith({
      sessionId: 'kodra-7',
      project: 'project',
      cwd: '/tmp/work',
      hookType: 'agent_run_started',
      timestamp: expect.any(String),
      data: { runId: 3 },
    });
  });

  it('supports the card session lifecycle with its own deterministic id', async () => {
    const { bridge, sessionStart, observe, sessionEnd } = makeBridge();

    bridge.startCardSession({ threadId: 12, project: 'project', cwd: '/tmp/work', title: 'Task' });
    bridge.startCardSession({ threadId: 12, project: 'project', cwd: '/tmp/work', title: 'Duplicate' });
    bridge.observeCard({
      threadId: 12,
      project: 'project',
      cwd: '/tmp/work',
      hookType: 'agent_run_started',
      data: { runId: 4 },
    });
    await vi.waitFor(() => expect(sessionStart).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(1));

    expect(sessionStart).toHaveBeenCalledWith({
      sessionId: memoryCardSessionId(12),
      project: 'project',
      cwd: '/tmp/work',
      title: 'Task',
    });
    expect(observe).toHaveBeenCalledWith({
      sessionId: memoryCardSessionId(12),
      project: 'project',
      cwd: '/tmp/work',
      hookType: 'agent_run_started',
      timestamp: expect.any(String),
      data: { runId: 4 },
    });

    bridge.endCardSession(12);
    await vi.waitFor(() => expect(sessionEnd).toHaveBeenCalledWith(memoryCardSessionId(12)));
    bridge.startCardSession({ threadId: 12, project: 'project', cwd: '/tmp/work' });
    await vi.waitFor(() => expect(sessionStart).toHaveBeenCalledTimes(2));
  });

  it('swallows client rejection and keeps processing later queue entries', async () => {
    const { bridge, sessionStart } = makeBridge();
    sessionStart.mockReset();
    sessionStart.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);

    expect(() => {
      bridge.startChatSession({ chatSessionId: 1, project: 'project', cwd: '/tmp/work' });
      bridge.startChatSession({ chatSessionId: 2, project: 'project', cwd: '/tmp/work' });
    }).not.toThrow();

    await vi.waitFor(() => expect(sessionStart).toHaveBeenCalledTimes(2));
    expect(sessionStart.mock.calls.map(([input]) => input.sessionId)).toEqual([
      'kodra-1',
      'kodra-2',
    ]);
  });

  it('caps the pending queue at 200 by dropping the oldest operation', async () => {
    const { bridge, sessionStart } = makeBridge();
    let unblock: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    sessionStart.mockReset();
    sessionStart.mockImplementation(async ({ sessionId }: { sessionId: string }) => {
      if (sessionId === 'kodra-1') await blocked;
      return true;
    });

    bridge.startChatSession({ chatSessionId: 1, project: 'project', cwd: '/tmp/work' });
    await vi.waitFor(() => expect(sessionStart).toHaveBeenCalledTimes(1));
    for (let chatSessionId = 2; chatSessionId <= 202; chatSessionId += 1) {
      bridge.startChatSession({ chatSessionId, project: 'project', cwd: '/tmp/work' });
    }

    unblock();
    await vi.waitFor(() => expect(sessionStart).toHaveBeenCalledTimes(201));
    const ids = sessionStart.mock.calls.map(([input]) => input.sessionId as string);
    expect(ids).toHaveLength(201);
    expect(ids[0]).toBe('kodra-1');
    expect(ids).not.toContain('kodra-2');
    expect(ids).toContain('kodra-202');
  });
});
