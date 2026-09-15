import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AgentRunEventPayload } from '../global.js';
import type { AgentEvent, Card, IssueActiveRun } from '../types.js';

type LiveSetter = Dispatch<SetStateAction<RunLiveMap>>;

interface RunLive {
  currentTool: string | null;
  currentArg: string | null;
  pendingDecision: IssueActiveRun['pendingDecision'];
}

export type RunLiveMap = Map<number, RunLive>;

const EMPTY_LIVE: RunLive = {
  currentTool: null,
  currentArg: null,
  pendingDecision: null,
};

interface PendingLiveUpdate {
  currentTool?: string | null;
  currentArg?: string | null;
  pendingDecision?: IssueActiveRun['pendingDecision'];
}

type LiveBufferRef = { current: Map<number, PendingLiveUpdate> };
type LiveTimerRef = { current: ReturnType<typeof setTimeout> | null };

type BoardAgentEventPayload =
  | AgentRunEventPayload
  | {
      subscriptionId: string;
      kind: 'replay';
      events: AgentEvent[];
      cards: Card[];
    };

function incrementPerfCounter(field: 'boardEventsIn' | 'boardUpdates'): void {
  if (!import.meta.env.DEV) return;
  const perf = ((window as unknown as { __kodraPerf?: Record<string, number> }).__kodraPerf ??= {});
  perf[field] = (perf[field] ?? 0) + 1;
}

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
  const liveBufferRef = useRef<Map<number, PendingLiveUpdate>>(new Map());
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decisionCardsRef = useRef(
    new Map<number, NonNullable<IssueActiveRun['pendingDecision']>>(),
  );

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
      liveBufferRef.current.delete(runId);
      decisionCardsRef.current.delete(runId);
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
          void bridge.invoke('agent-runs:events:ready', { subscriptionId }).catch(() => {});
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
      const payload = raw as BoardAgentEventPayload;
      const runId = subsById.get(payload.subscriptionId);
      if (runId === undefined) return;
      if (import.meta.env.DEV) incrementPerfCounter('boardEventsIn');

      if (payload.kind === 'event') {
        applyEvent(setMap, runId, payload.event, liveBufferRef, liveTimerRef);
      } else if (payload.kind === 'card') {
        applyCard(setMap, runId, payload.card, liveBufferRef, liveTimerRef, decisionCardsRef);
      } else if (payload.kind === 'replay') {
        applyReplay(setMap, runId, payload.events, payload.cards, decisionCardsRef);
      } else if (payload.kind === 'status') {
        applyStatus(setMap, runId, payload.status, liveBufferRef, liveTimerRef, decisionCardsRef);
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
      if (liveTimerRef.current !== null) {
        clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      liveBufferRef.current.clear();
      decisionCardsRef.current.clear();
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
  liveBufferRef: LiveBufferRef,
  liveTimerRef: LiveTimerRef,
): void {
  if (ev.type !== 'tool_use') return;
  const p = ev.payload as { name?: string; input?: unknown };
  queueLiveUpdate(liveBufferRef, liveTimerRef, setMap, runId, {
    currentTool: p.name ?? null,
    currentArg: summarizeInput(p.input),
  });
}

function applyCard(
  setMap: LiveSetter,
  runId: number,
  card: Card,
  liveBufferRef: LiveBufferRef,
  liveTimerRef: LiveTimerRef,
  decisionCardsRef: { current: Map<number, NonNullable<IssueActiveRun['pendingDecision']>> },
): void {
  if (card.type !== 'decision') return;
  if (card.status === 'pending') {
    const pendingDecision = pendingDecisionFromCard(card);
    if (pendingDecision === null) return;
    decisionCardsRef.current.set(runId, pendingDecision);
    queueLiveUpdate(liveBufferRef, liveTimerRef, setMap, runId, { pendingDecision });
    return;
  }
  decisionCardsRef.current.delete(runId);
  queueLiveUpdate(liveBufferRef, liveTimerRef, setMap, runId, { pendingDecision: null });
}

function pendingDecisionFromCard(
  card: Card,
): NonNullable<IssueActiveRun['pendingDecision']> | null {
  if (card.type !== 'decision' || card.status !== 'pending') return null;
  const p = card.payload as { question?: string; options?: unknown };
  if (typeof p.question !== 'string' || !Array.isArray(p.options)) return null;
  const opts = p.options
    .filter(
      (o): o is { value: string; label: string } =>
        typeof o === 'object' &&
        o !== null &&
        typeof (o as { value: unknown }).value === 'string' &&
        typeof (o as { label: unknown }).label === 'string',
    )
    .map((o) => ({ value: o.value, label: o.label }));
  if (opts.length === 0) return null;
  return { cardId: card.id, question: p.question, options: opts };
}

function queueLiveUpdate(
  liveBufferRef: LiveBufferRef,
  liveTimerRef: LiveTimerRef,
  setMap: LiveSetter,
  runId: number,
  update: PendingLiveUpdate,
): void {
  const pending = liveBufferRef.current.get(runId) ?? {};
  liveBufferRef.current.set(runId, { ...pending, ...update });
  if (liveTimerRef.current !== null) return;
  liveTimerRef.current = setTimeout(() => {
    liveTimerRef.current = null;
    flushLiveUpdates(setMap, liveBufferRef);
  }, 150);
}

function flushLiveUpdates(setMap: LiveSetter, liveBufferRef: LiveBufferRef): void {
  if (liveBufferRef.current.size === 0) return;
  const updates = new Map(liveBufferRef.current);
  liveBufferRef.current.clear();
  if (import.meta.env.DEV) incrementPerfCounter('boardUpdates');
  setMap((prev) => {
    let next = prev;
    for (const [runId, update] of updates) {
      const cur = next.get(runId) ?? EMPTY_LIVE;
      next = new Map(next);
      next.set(runId, { ...cur, ...update });
    }
    return next;
  });
}

function applyReplay(
  setMap: LiveSetter,
  runId: number,
  events: AgentEvent[],
  cards: Card[],
  decisionCardsRef: { current: Map<number, NonNullable<IssueActiveRun['pendingDecision']>> },
): void {
  let lastTool: { currentTool: string | null; currentArg: string | null } | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev?.type !== 'tool_use') continue;
    const p = ev.payload as { name?: string; input?: unknown };
    lastTool = { currentTool: p.name ?? null, currentArg: summarizeInput(p.input) };
    break;
  }
  let pendingDecision: NonNullable<IssueActiveRun['pendingDecision']> | null = null;
  decisionCardsRef.current.delete(runId);
  for (const card of cards) {
    const decision = pendingDecisionFromCard(card);
    if (decision !== null) {
      pendingDecision = decision;
      decisionCardsRef.current.set(runId, decision);
    } else if (card.type === 'decision' && card.status !== 'pending') {
      pendingDecision = null;
      decisionCardsRef.current.delete(runId);
    }
  }
  if (import.meta.env.DEV) incrementPerfCounter('boardUpdates');
  setMap((prev) => {
    const cur = prev.get(runId) ?? EMPTY_LIVE;
    const next = new Map(prev);
    next.set(runId, {
      ...cur,
      ...(lastTool ?? {}),
      pendingDecision,
    });
    return next;
  });
}

function applyStatus(
  setMap: LiveSetter,
  runId: number,
  status: string,
  liveBufferRef: LiveBufferRef,
  liveTimerRef: LiveTimerRef,
  decisionCardsRef: { current: Map<number, NonNullable<IssueActiveRun['pendingDecision']>> },
): void {
  if (status !== 'awaiting_input') return;
  const pendingDecision = decisionCardsRef.current.get(runId);
  if (pendingDecision !== undefined) {
    queueLiveUpdate(liveBufferRef, liveTimerRef, setMap, runId, { pendingDecision });
  }
}
