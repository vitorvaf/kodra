import { useEffect, useRef, useState, type SetStateAction } from 'react';
import type { AgentRunEventPayload } from '../global.js';
import type { AgentEvent, AgentRunStatus, Card } from '../types.js';

type AgentRunReplayPayload = {
  subscriptionId: string;
  kind: 'replay';
  events: AgentEvent[];
  cards: Card[];
};

type AgentRunStreamPayload = AgentRunEventPayload | AgentRunReplayPayload;

export interface AgentRunStreamState {
  events: AgentEvent[];
  cards: Card[];
  status: AgentRunStatus | null;
  error: string | null;
}

const EMPTY_STATE: AgentRunStreamState = {
  events: [],
  cards: [],
  status: null,
  error: null,
};

type PerfCounter = 'chatEventsIn' | 'chatFlushes' | 'chatStateUpdates';

function incrementDevCounter(name: PerfCounter): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const perf = ((window as any).__kodraPerf ??= {}) as Record<string, number>;
  perf[name] = (perf[name] ?? 0) + 1;
}

/**
 * @param runId run to subscribe to (null disables)
 * @param resubscribeKey bump to force a fresh subscription even if `runId`
 *   stays the same. Needed for chat conversations where a single run id
 *   resumes after a terminal status — the server-side subscription closes
 *   on terminal status, so without re-subscribing the renderer would miss
 *   the events of the resumed run.
 */
export function useAgentRunStream(
  runId: number | null,
  resubscribeKey: number = 0,
): AgentRunStreamState {
  const [state, setState] = useState<AgentRunStreamState>(EMPTY_STATE);
  const eventBufferRef = useRef<AgentEvent[]>([]);
  const cardBufferRef = useRef<Card[]>([]);
  const seenSeqsRef = useRef<Set<number>>(new Set());
  const maxSeqRef = useRef(-Infinity);
  const rafRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelScheduledFlush = (): void => {
    if (rafRef.current !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
    }
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  const resetAccumulator = (): void => {
    cancelScheduledFlush();
    eventBufferRef.current.length = 0;
    cardBufferRef.current.length = 0;
    seenSeqsRef.current.clear();
    maxSeqRef.current = -Infinity;
  };

  useEffect(() => {
    resetAccumulator();

    const updateState = (next: SetStateAction<AgentRunStreamState>): void => {
      incrementDevCounter('chatStateUpdates');
      setState(next);
    };

    if (runId === null) {
      updateState(EMPTY_STATE);
      return;
    }

    updateState(EMPTY_STATE);

    const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
    if (!bridge) {
      updateState({
        ...EMPTY_STATE,
        error: 'window.kanbots not available — renderer must run inside Electron',
      });
      return;
    }

    let cancelled = false;
    let subscriptionId: string | null = null;
    let unsubscribeBridge: (() => void) | null = null;

    const flush = (): void => {
      if (cancelled) return;
      cancelScheduledFlush();

      const bufferedEvents = eventBufferRef.current.splice(0);
      const bufferedCards = cardBufferRef.current.splice(0);
      if (bufferedEvents.length === 0 && bufferedCards.length === 0) return;
      incrementDevCounter('chatFlushes');

      const freshEvents: AgentEvent[] = [];
      let outOfOrder = false;
      let batchMaxSeq = maxSeqRef.current;
      for (const event of bufferedEvents) {
        if (seenSeqsRef.current.has(event.seq)) continue;
        if (event.seq < batchMaxSeq) outOfOrder = true;
        batchMaxSeq = Math.max(batchMaxSeq, event.seq);
        seenSeqsRef.current.add(event.seq);
        freshEvents.push(event);
      }
      maxSeqRef.current = batchMaxSeq;

      const cardsById = new Map<number, Card>();
      for (const card of bufferedCards) cardsById.set(card.id, card);

      if (freshEvents.length === 0 && cardsById.size === 0) return;
      updateState((prev) => {
        let nextEvents = prev.events;
        if (freshEvents.length > 0) {
          nextEvents = outOfOrder
            ? [...prev.events, ...freshEvents].sort((a, b) => a.seq - b.seq)
            : prev.events.concat(freshEvents);
        }

        let nextCards = prev.cards;
        if (cardsById.size > 0) {
          nextCards = [...prev.cards];
          const cardIndexes = new Map<number, number>();
          nextCards.forEach((card, index) => cardIndexes.set(card.id, index));
          for (const card of cardsById.values()) {
            const index = cardIndexes.get(card.id);
            if (index === undefined) {
              cardIndexes.set(card.id, nextCards.length);
              nextCards.push(card);
            } else {
              nextCards[index] = card;
            }
          }
        }

        return { ...prev, events: nextEvents, cards: nextCards };
      });
    };

    const scheduleFlush = (): void => {
      if (rafRef.current === null && typeof requestAnimationFrame === 'function') {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          flush();
        });
      }
      // rAF can be throttled in a background window, so keep a hard latency
      // bound alongside it rather than relying on rAF alone.
      if (fallbackTimerRef.current === null) {
        fallbackTimerRef.current = setTimeout(() => {
          fallbackTimerRef.current = null;
          flush();
        }, 50);
      }
    };

    const applyReplay = (payload: AgentRunReplayPayload): void => {
      const pendingEvents = eventBufferRef.current.splice(0);
      const pendingCards = cardBufferRef.current.splice(0);
      cancelScheduledFlush();

      const eventsBySeq = new Map<number, AgentEvent>();
      for (const event of payload.events) eventsBySeq.set(event.seq, event);
      for (const event of pendingEvents) eventsBySeq.set(event.seq, event);
      const replayEvents = Array.from(eventsBySeq.values());
      for (const event of replayEvents) {
        seenSeqsRef.current.add(event.seq);
        maxSeqRef.current = Math.max(maxSeqRef.current, event.seq);
      }

      const cardsById = new Map<number, Card>();
      for (const card of payload.cards) cardsById.set(card.id, card);
      for (const card of pendingCards) cardsById.set(card.id, card);

      // The replay is one history batch, so it gets one state update and one
      // sort regardless of how many events the run already contains.
      updateState((prev) => {
        const mergedEventsBySeq = new Map<number, AgentEvent>();
        for (const event of prev.events) mergedEventsBySeq.set(event.seq, event);
        for (const event of replayEvents) mergedEventsBySeq.set(event.seq, event);
        const mergedEvents = Array.from(mergedEventsBySeq.values()).sort(
          (a, b) => a.seq - b.seq,
        );

        const mergedCardsById = new Map<number, Card>();
        for (const card of prev.cards) mergedCardsById.set(card.id, card);
        for (const card of cardsById.values()) mergedCardsById.set(card.id, card);

        return {
          ...prev,
          events: mergedEvents,
          cards: Array.from(mergedCardsById.values()),
        };
      });
    };

    bridge
      .invoke('agent-runs:events:subscribe', { runId })
      .then(({ subscriptionId: subId, runStatus }) => {
        if (cancelled) {
          void bridge.invoke('agent-runs:events:unsubscribe', { subscriptionId: subId });
          return;
        }
        subscriptionId = subId;
        updateState((prev) => ({ ...prev, status: runStatus }));
        unsubscribeBridge = bridge.subscribe('agent-runs:events:data', (raw) => {
          if (cancelled) return;
          const payload = raw as AgentRunStreamPayload;
          if (payload.subscriptionId !== subId) return;
          incrementDevCounter('chatEventsIn');
          if (payload.kind === 'replay') {
            applyReplay(payload);
          } else if (payload.kind === 'event') {
            eventBufferRef.current.push(payload.event);
            scheduleFlush();
          } else if (payload.kind === 'card') {
            cardBufferRef.current.push(payload.card);
            scheduleFlush();
          } else if (payload.kind === 'status') {
            // Status is deliberately immediate: it drives the live/terminal
            // UI and is infrequent compared with event payloads.
            if (
              payload.status !== 'starting' &&
              payload.status !== 'running' &&
              payload.status !== 'awaiting_input'
            ) {
              flush();
            }
            updateState((prev) => ({ ...prev, status: payload.status }));
          }
          // 'end' → main process auto-cleans the subscription; nothing to do.
        });
        void bridge
          .invoke('agent-runs:events:ready', { subscriptionId: subId })
          .catch(() => {});
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        updateState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : String(err),
        }));
      });

    return () => {
      cancelled = true;
      resetAccumulator();
      if (unsubscribeBridge) unsubscribeBridge();
      if (subscriptionId !== null) {
        void bridge.invoke('agent-runs:events:unsubscribe', { subscriptionId });
      }
    };
  }, [runId, resubscribeKey]);

  return state;
}
