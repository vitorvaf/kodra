import type { AgentMemoryClient } from './client.js';

/**
 * Best-effort lifecycle bridge mapping Kodra logical sessions to agentmemory
 * REST sessions. Fire-and-forget by design: a memory outage must never delay
 * or fail an agent run (Electron main hot path).
 *
 * Two session families:
 * - chat sessions → agentmemory id `kodra-<chatSessionId>` (thread-chat flow)
 * - card sessions → agentmemory id `kodra-card-<threadId>` (kanban dispatch
 *   flow, where runs carry no chat_session_id)
 */
export interface AgentMemorySessionBridge {
  startChatSession(input: {
    chatSessionId: number;
    project: string;
    cwd: string;
    title?: string | null;
  }): void;
  observeChat(input: {
    chatSessionId: number;
    project: string;
    cwd: string;
    hookType: string;
    data?: Record<string, unknown>;
  }): void;
  endChatSession(chatSessionId: number): void;
  startCardSession(input: {
    threadId: number;
    project: string;
    cwd: string;
    title?: string | null;
  }): void;
  observeCard(input: {
    threadId: number;
    project: string;
    cwd: string;
    hookType: string;
    data?: Record<string, unknown>;
  }): void;
  endCardSession(threadId: number): void;
}

export interface AgentMemorySessionBridgeOptions {
  client: Pick<AgentMemoryClient, 'sessionStart' | 'observe' | 'sessionEnd'>;
  getConfig: () => { enabled: boolean } | null | undefined;
}

export function memoryChatSessionId(chatSessionId: number): string {
  return `kodra-${chatSessionId}`;
}

export function memoryCardSessionId(threadId: number): string {
  return `kodra-card-${threadId}`;
}

const QUEUE_CAP = 200;

type Operation = () => Promise<boolean>;

export function createAgentMemorySessionBridge(
  options: AgentMemorySessionBridgeOptions,
): AgentMemorySessionBridge {
  const pending: Operation[] = [];
  const startedChats = new Set<number>();
  const startedCards = new Set<number>();
  let draining = false;
  let drainScheduled = false;
  let unavailable = false;

  function warn(message: string): void {
    try {
      console.warn(`[agentmemory] ${message}`);
    } catch {
      // Best-effort logging must not affect the caller.
    }
  }

  async function run(operation: Operation): Promise<void> {
    try {
      const succeeded = await operation();
      if (succeeded) {
        unavailable = false;
      } else if (!unavailable) {
        unavailable = true;
        warn('unavailable');
      }
    } catch {
      if (!unavailable) {
        unavailable = true;
        warn('unavailable');
      }
    }
  }

  async function drain(): Promise<void> {
    drainScheduled = false;
    if (draining) return;
    draining = true;
    try {
      while (pending.length > 0) {
        const operation = pending.shift();
        if (operation) await run(operation);
      }
    } finally {
      draining = false;
      if (pending.length > 0) scheduleDrain();
    }
  }

  function scheduleDrain(): void {
    if (drainScheduled || draining) return;
    drainScheduled = true;
    void Promise.resolve().then(drain).catch(() => {
      // Final guard for unexpected failures in queue bookkeeping.
      drainScheduled = false;
      draining = false;
    });
  }

  function enqueue(operation: Operation): boolean {
    try {
      if (!options.getConfig()?.enabled) return false;
    } catch {
      return false;
    }
    if (pending.length >= QUEUE_CAP) {
      pending.shift();
      warn('queue overflow, dropped oldest');
    }
    pending.push(operation);
    scheduleDrain();
    return true;
  }

  /** Start a session family at most once per bridge lifetime: agentmemory's
   * /session/start is an upsert that OVERWRITES the record and resets
   * observationCount, so re-starting mid-session destroys the count. */
  function startSession(
    sessionId: string,
    started: Set<number>,
    key: number,
    project: string,
    cwd: string,
    title?: string | null,
  ): void {
    try {
      if (!options.getConfig()?.enabled || started.has(key)) return;
      started.add(key);
      const enqueued = enqueue(async () => {
        const result = await options.client.sessionStart({
          sessionId,
          project,
          cwd,
          ...(title !== undefined && title !== null ? { title } : {}),
        });
        if (result) warn(`session started ${sessionId}`);
        return result;
      });
      if (!enqueued) started.delete(key);
    } catch {
      // Fire-and-forget, including config/client access.
    }
  }

  function observe(
    sessionId: string,
    project: string,
    cwd: string,
    hookType: string,
    data?: Record<string, unknown>,
  ): void {
    try {
      if (!options.getConfig()?.enabled) return;
      enqueue(() =>
        options.client.observe({
          sessionId,
          project,
          cwd,
          hookType,
          timestamp: new Date().toISOString(),
          ...(data !== undefined ? { data } : {}),
        }),
      );
    } catch {
      // Fire-and-forget, including config/client access.
    }
  }

  function endSession(started: Set<number>, key: number, sessionId: string): void {
    try {
      const enqueued = enqueue(async () => {
        const result = await options.client.sessionEnd(sessionId);
        if (result) warn(`session ended ${sessionId}`);
        return result;
      });
      if (enqueued) started.delete(key);
    } catch {
      // Fire-and-forget, including config/client access.
    }
  }

  return {
    startChatSession: (input) =>
      startSession(
        memoryChatSessionId(input.chatSessionId),
        startedChats,
        input.chatSessionId,
        input.project,
        input.cwd,
        input.title,
      ),
    observeChat: (input) =>
      observe(
        memoryChatSessionId(input.chatSessionId),
        input.project,
        input.cwd,
        input.hookType,
        input.data,
      ),
    endChatSession: (chatSessionId) =>
      endSession(startedChats, chatSessionId, memoryChatSessionId(chatSessionId)),
    startCardSession: (input) =>
      startSession(
        memoryCardSessionId(input.threadId),
        startedCards,
        input.threadId,
        input.project,
        input.cwd,
        input.title,
      ),
    observeCard: (input) =>
      observe(
        memoryCardSessionId(input.threadId),
        input.project,
        input.cwd,
        input.hookType,
        input.data,
      ),
    endCardSession: (threadId) =>
      endSession(startedCards, threadId, memoryCardSessionId(threadId)),
  };
}
