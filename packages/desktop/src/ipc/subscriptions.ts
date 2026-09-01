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
  size(): number;
}

interface Entry {
  subscriptionId: string;
  unsub: (() => void) | null;
  ownerId: number | undefined;
}

const ACTIVE_STATUSES: ReadonlyArray<AgentRunStatus> = [
  'starting',
  'running',
  'awaiting_input',
];

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
    if (entry.unsub) entry.unsub();
    entries.delete(subscriptionId);
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
    };
    entries.set(subscriptionId, entry);

    // Replay history. Events first, then cards — order matches what a fresh
    // SSE consumer would have received over time.
    for (const event of supervisor.listEvents(input.runId, input.sinceSeq)) {
      forward({ subscriptionId, kind: 'event', event }, input.ownerId);
    }
    for (const card of supervisor.listCards(input.runId)) {
      forward({ subscriptionId, kind: 'card', card }, input.ownerId);
    }

    if (supervisor.isActive(input.runId)) {
      const onEvent = (e: AgentEvent): void => {
        if (!entries.has(subscriptionId)) return;
        forward({ subscriptionId, kind: 'event', event: e }, input.ownerId);
      };
      const onStatus = (status: AgentRunStatus): void => {
        if (!entries.has(subscriptionId)) return;
        forward({ subscriptionId, kind: 'status', status }, input.ownerId);
        if (isTerminal(status)) {
          forward({ subscriptionId, kind: 'end' }, input.ownerId);
          finalize(subscriptionId);
        }
      };
      const onCard = (c: Card): void => {
        if (!entries.has(subscriptionId)) return;
        forward({ subscriptionId, kind: 'card', card: c }, input.ownerId);
      };
      entry.unsub = supervisor.subscribe(input.runId, onEvent, onStatus, onCard);
    } else {
      forward({ subscriptionId, kind: 'status', status: run.status }, input.ownerId);
      forward({ subscriptionId, kind: 'end' }, input.ownerId);
      finalize(subscriptionId);
    }

    return { subscriptionId, runStatus: run.status };
  }

  function unregister(subscriptionId: string): void {
    const entry = entries.get(subscriptionId);
    if (!entry) return;
    if (entry.unsub) entry.unsub();
    entries.delete(subscriptionId);
  }

  function closeAllForOwner(ownerId: number): void {
    for (const [id, entry] of entries) {
      if (entry.ownerId !== ownerId) continue;
      if (entry.unsub) entry.unsub();
      entries.delete(id);
    }
  }

  function size(): number {
    return entries.size;
  }

  return { register, unregister, closeAllForOwner, size };
}
