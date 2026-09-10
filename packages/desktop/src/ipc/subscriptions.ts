import { randomUUID } from 'node:crypto';
import type { AgentSupervisor } from '@kanbots/api';
import type { AgentEvent, AgentRunStatus, Card } from '@kanbots/local-store';
import type { AgentRunEventPayload, SubscriptionRegistry } from '@kanbots/api';

export interface ForwardEvent {
  (payload: AgentRunEventPayload, ownerId: number | undefined): void;
}

export interface CreateSubscriptionRegistryOptions {
  supervisor: AgentSupervisor;
  forward: ForwardEvent;
}

export interface OwnedSubscriptionRegistry extends SubscriptionRegistry {
  closeAllForOwner(ownerId: number): void;
  ready(subscriptionId: string): void;
  size(): number;
}

interface Entry {
  subscriptionId: string;
  unsub: (() => void) | null;
  ownerId: number | undefined;
  pending: AgentRunEventPayload[] | null;
  finalAfterDrain: boolean;
  readyTimer: ReturnType<typeof setTimeout> | null;
}

const ACTIVE_STATUSES: ReadonlyArray<AgentRunStatus> = [
  'starting',
  'running',
  'awaiting_input',
];
const READY_TIMEOUT_MS = 5000;

function isTerminal(status: AgentRunStatus): boolean {
  return !ACTIVE_STATUSES.includes(status);
}

function notFound(runId: number): Error {
  return Object.assign(new Error(`agent run ${runId} not found`), {
    name: 'NotFound',
  });
}

export function createSubscriptionRegistry(
  opts: CreateSubscriptionRegistryOptions,
): OwnedSubscriptionRegistry {
  const { supervisor, forward } = opts;
  const entries = new Map<string, Entry>();

  function finalize(subscriptionId: string): void {
    const entry = entries.get(subscriptionId);
    if (!entry) return;
    clearReadyTimer(entry);
    if (entry.unsub) entry.unsub();
    entries.delete(subscriptionId);
  }

  function clearReadyTimer(entry: Entry): void {
    if (entry.readyTimer === null) return;
    clearTimeout(entry.readyTimer);
    entry.readyTimer = null;
  }

  function emit(entry: Entry, payload: AgentRunEventPayload): void {
    if (entry.pending !== null) {
      entry.pending.push(payload);
      return;
    }
    forward(payload, entry.ownerId);
  }

  function register(input: {
    runId: number;
    sinceSeq?: number;
    ownerId?: number;
  }): { subscriptionId: string; runStatus: AgentRunStatus } {
    const run = supervisor.getRun(input.runId);
    if (!run) throw notFound(input.runId);

    const subscriptionId = randomUUID();
    const entry: Entry = {
      subscriptionId,
      unsub: null,
      ownerId: input.ownerId,
      pending: [],
      finalAfterDrain: false,
      readyTimer: null,
    };
    entries.set(subscriptionId, entry);
    entry.readyTimer = setTimeout(() => drainPending(entry), READY_TIMEOUT_MS);
    const timer = entry.readyTimer;
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      (timer as { unref: () => void }).unref();
    }

    // Replay history. Events first, then cards — order matches what a fresh
    // SSE consumer would have received over time.
    const events = supervisor.listEvents(input.runId, input.sinceSeq);
    const cards = supervisor.listCards(input.runId);
    emit(entry, { subscriptionId, kind: 'replay', events, cards });

    if (supervisor.isActive(input.runId)) {
      const onEvent = (e: AgentEvent): void => {
        if (!entries.has(subscriptionId)) return;
        emit(entry, { subscriptionId, kind: 'event', event: e });
      };
      const onStatus = (status: AgentRunStatus): void => {
        if (!entries.has(subscriptionId)) return;
        emit(entry, { subscriptionId, kind: 'status', status });
        if (isTerminal(status)) {
          emit(entry, { subscriptionId, kind: 'end' });
          entry.finalAfterDrain = true;
          if (entry.pending === null) finalize(subscriptionId);
        }
      };
      const onCard = (c: Card): void => {
        if (!entries.has(subscriptionId)) return;
        emit(entry, { subscriptionId, kind: 'card', card: c });
      };
      entry.unsub = supervisor.subscribe(input.runId, onEvent, onStatus, onCard);
    } else {
      emit(entry, { subscriptionId, kind: 'status', status: run.status });
      emit(entry, { subscriptionId, kind: 'end' });
      entry.finalAfterDrain = true;
    }

    return { subscriptionId, runStatus: run.status };
  }

  function unregister(subscriptionId: string): void {
    const entry = entries.get(subscriptionId);
    if (!entry) return;
    if (entry.unsub) entry.unsub();
    clearReadyTimer(entry);
    entry.pending = null;
    entries.delete(subscriptionId);
  }

  function drainPending(entry: Entry): void {
    clearReadyTimer(entry);
    if (entry.pending === null) return;
    const pending = entry.pending;
    for (const payload of pending) forward(payload, entry.ownerId);
    entry.pending = null;
    if (entry.finalAfterDrain) finalize(entry.subscriptionId);
  }

  function ready(subscriptionId: string): void {
    const entry = entries.get(subscriptionId);
    if (!entry) return;
    drainPending(entry);
  }

  function closeAllForOwner(ownerId: number): void {
    for (const [id, entry] of entries) {
      if (entry.ownerId !== ownerId) continue;
      if (entry.unsub) entry.unsub();
      clearReadyTimer(entry);
      entry.pending = null;
      entries.delete(id);
    }
  }

  function size(): number {
    return entries.size;
  }

  return { register, unregister, ready, closeAllForOwner, size };
}
