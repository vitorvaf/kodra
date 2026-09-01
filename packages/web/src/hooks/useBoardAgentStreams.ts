import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AgentRunEventPayload } from '../global.js';
import type { AgentEvent, Card, IssueActiveRun } from '../types.js';

type LiveSetter = Dispatch<SetStateAction<RunLiveMap>>;

interface RunLive {
  currentTool: string | null;
  currentArg: string | null;
  pendingDecision: IssueActiveRun['pendingDecision'];
  eventCount: number;
}

export type RunLiveMap = Map<number, RunLive>;

const EMPTY_LIVE: RunLive = {
  currentTool: null,
  currentArg: null,
  pendingDecision: null,
  eventCount: 0,
};

function summarizeInput(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return null;
  }
}

interface ActiveSub {
  runId: number;
  subscriptionId: string | null;
  pendingCancel: boolean;
}

/**
 * Subscribes one bridge stream per active run and exposes a flat map of
 * currentTool / currentArg / pendingDecision keyed by runId so cards can
 * render live state without each opening their own subscription.
 *
 * Single window.kanbots.subscribe('agent-runs:events:data') listener
 * demultiplexes payloads by subscriptionId.
 */
export function useBoardAgentStreams(runIds: readonly number[]): RunLiveMap {
  const [map, setMap] = useState<RunLiveMap>(() => new Map());
  const subsRef = useRef<Map<number, ActiveSub>>(new Map());
  const subsByIdRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
    if (!bridge) return;

    const wanted = new Set(runIds);
    const subs = subsRef.current;
    const subsById = subsByIdRef.current;

    // Tear down subs for runs no longer active.
    for (const [runId, sub] of subs) {
      if (wanted.has(runId)) continue;
      subs.delete(runId);
      if (sub.subscriptionId !== null) {
        const id = sub.subscriptionId;
        subsById.delete(id);
        void bridge.invoke('agent-runs:events:unsubscribe', { subscriptionId: id });
      } else {
        // Subscribe is still in flight; flag so the resolver discards it.
        sub.pendingCancel = true;
      }
    }

    // Spin up subs for newly active runs.
    for (const runId of wanted) {
      if (subs.has(runId)) continue;
      const sub: ActiveSub = { runId, subscriptionId: null, pendingCancel: false };
      subs.set(runId, sub);
      bridge
        .invoke('agent-runs:events:subscribe', { runId })
        .then(({ subscriptionId }) => {
          if (sub.pendingCancel || subs.get(runId) !== sub) {
            void bridge.invoke('agent-runs:events:unsubscribe', { subscriptionId });
            return;
          }
          sub.subscriptionId = subscriptionId;
          subsById.set(subscriptionId, runId);
        })
        .catch(() => {
          // Drop the slot so a later effect can retry.
          if (subs.get(runId) === sub) subs.delete(runId);
        });
    }
  }, [runIds.join(',')]);

  // Single bridge.subscribe listener; lives across re-renders.
  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
    if (!bridge) return undefined;
    const subsById = subsByIdRef.current;

    const unsubscribe = bridge.subscribe('agent-runs:events:data', (raw) => {
      const payload = raw as AgentRunEventPayload;
      const runId = subsById.get(payload.subscriptionId);
      if (runId === undefined) return;

      if (payload.kind === 'event') {
        applyEvent(setMap, runId, payload.event);
      } else if (payload.kind === 'card') {
        applyCard(setMap, runId, payload.card);
      } else if (payload.kind === 'status') {
        applyStatus(setMap, runId, payload.status);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Cleanup on unmount: unsubscribe every active sub.
  useEffect(() => {
    const subs = subsRef.current;
    const subsById = subsByIdRef.current;
    return () => {
      const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
      if (bridge) {
        for (const sub of subs.values()) {
          if (sub.subscriptionId !== null) {
            void bridge.invoke('agent-runs:events:unsubscribe', {
              subscriptionId: sub.subscriptionId,
            });
          } else {
            sub.pendingCancel = true;
          }
        }
      }
      subs.clear();
      subsById.clear();
    };
  }, []);

  return map;
}

function applyEvent(
  setMap: LiveSetter,
  runId: number,
  ev: AgentEvent,
): void {
  if (ev.type !== 'tool_use') {
    setMap((prev) => {
      const cur = prev.get(runId) ?? EMPTY_LIVE;
      const next = new Map(prev);
      next.set(runId, { ...cur, eventCount: cur.eventCount + 1 });
      return next;
    });
    return;
  }
  const p = ev.payload as { name?: string; input?: unknown };
  setMap((prev) => {
    const cur = prev.get(runId) ?? EMPTY_LIVE;
    const next = new Map(prev);
    next.set(runId, {
      ...cur,
      currentTool: p.name ?? null,
      currentArg: summarizeInput(p.input),
      eventCount: cur.eventCount + 1,
    });
    return next;
  });
}

function applyCard(
  setMap: LiveSetter,
  runId: number,
  card: Card,
): void {
  if (card.type !== 'decision' || card.status !== 'pending') return;
  const p = card.payload as { question?: string; options?: unknown };
  if (typeof p.question !== 'string' || !Array.isArray(p.options)) return;
  const opts = p.options
    .filter(
      (o): o is { value: string; label: string } =>
        typeof o === 'object' &&
        o !== null &&
        typeof (o as { value: unknown }).value === 'string' &&
        typeof (o as { label: unknown }).label === 'string',
    )
    .map((o) => ({ value: o.value, label: o.label }));
  if (opts.length === 0) return;
  setMap((prev) => {
    const cur = prev.get(runId) ?? EMPTY_LIVE;
    const next = new Map(prev);
    next.set(runId, {
      ...cur,
      pendingDecision: {
        cardId: card.id,
        question: p.question as string,
        options: opts,
      },
    });
    return next;
  });
}

function applyStatus(
  setMap: LiveSetter,
  runId: number,
  status: string,
): void {
  if (status === 'awaiting_input') return;
  setMap((prev) => {
    const cur = prev.get(runId);
    if (!cur || cur.pendingDecision === null) return prev;
    const next = new Map(prev);
    next.set(runId, { ...cur, pendingDecision: null });
    return next;
  });
}
