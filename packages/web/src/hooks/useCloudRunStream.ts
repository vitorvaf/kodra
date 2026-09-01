import { useEffect, useState } from 'react';
import type { AgentEvent, AgentRunStatus, Card } from '../types.js';

/**
 * Cloud-mode counterpart of useAgentRunStream. Subscribes to the cloud
 * SSE stream for a given run KSUID via the desktop bridge
 * (`cloudRunsStreamStart`) and translates cloud-shaped events into the
 * same AgentRunStreamState the local hook produces, so OverviewTab /
 * ThreadTab can render either source without branching on transport.
 */

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

interface CloudRunEventMessage {
  subscriptionId: string;
  event?: { id: string; event: string; data: unknown };
  done?: boolean;
  error?: string;
}

interface CloudEventData {
  seq?: unknown;
  type?: unknown;
  source?: unknown;
  payload?: unknown;
  created_at?: unknown;
}

// Cloud writes events with type strings that match the local
// AgentEventType enum (tool_use / tool_result / text / error /
// containment_warning). Unknown types are dropped — adding new event
// types is a server change that ships with renderer code anyway.
const KNOWN_AGENT_EVENT_TYPES = new Set([
  'tool_use',
  'tool_result',
  'text',
  'error',
  'containment_warning',
]);

function statusFromConnected(data: unknown): AgentRunStatus | null {
  if (!data || typeof data !== 'object') return null;
  const s = (data as { status?: unknown }).status;
  return typeof s === 'string' ? (s as AgentRunStatus) : null;
}

function statusFromClosed(data: unknown): AgentRunStatus | null {
  if (!data || typeof data !== 'object') return null;
  const s = (data as { status?: unknown }).status;
  return typeof s === 'string' ? (s as AgentRunStatus) : null;
}

function toAgentEvent(raw: { id: string; event: string; data: unknown }): AgentEvent | null {
  if (!KNOWN_AGENT_EVENT_TYPES.has(raw.event)) return null;
  const data = (raw.data ?? {}) as CloudEventData;
  const seqRaw = data.seq;
  const seq =
    typeof seqRaw === 'number'
      ? seqRaw
      : Number.parseInt(typeof seqRaw === 'string' ? seqRaw : raw.id, 10);
  if (!Number.isFinite(seq)) return null;
  const createdAt =
    typeof data.created_at === 'string' ? data.created_at : new Date().toISOString();
  return {
    id: seq,
    agentRunId: 0,
    seq,
    type: raw.event as AgentEvent['type'],
    payload: data.payload ?? null,
    createdAt,
  };
}

export interface UseCloudRunStreamOpts {
  orgSlug: string;
  projectSlug: string;
  /** KSUID of the cloud run. Null disables the subscription. */
  cloudRunId: string | null;
}

export function useCloudRunStream(opts: UseCloudRunStreamOpts): AgentRunStreamState {
  const { orgSlug, projectSlug, cloudRunId } = opts;
  const [state, setState] = useState<AgentRunStreamState>(EMPTY_STATE);

  useEffect(() => {
    if (cloudRunId === null) {
      setState(EMPTY_STATE);
      return;
    }
    const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
    if (!bridge) {
      setState({
        ...EMPTY_STATE,
        error: 'window.kanbots not available — renderer must run inside Electron',
      });
      return;
    }

    setState(EMPTY_STATE);

    let cancelled = false;
    let subscriptionId: string | null = null;
    let unsubscribeBridge: (() => void) | null = null;

    unsubscribeBridge = bridge.subscribe('kanbots:cloud:run-event', (raw) => {
      const msg = raw as CloudRunEventMessage;
      if (subscriptionId === null || msg.subscriptionId !== subscriptionId) return;
      if (msg.error !== undefined) {
        setState((prev) => ({ ...prev, error: msg.error ?? null }));
        return;
      }
      if (msg.done === true) {
        // server flagged terminal — leave events in place; status already
        // arrived via the prior `closed` event.
        return;
      }
      const ev = msg.event;
      if (ev === undefined) return;
      if (ev.event === 'connected') {
        const status = statusFromConnected(ev.data);
        if (status !== null) setState((prev) => ({ ...prev, status }));
        return;
      }
      if (ev.event === 'closed') {
        const status = statusFromClosed(ev.data);
        if (status !== null) setState((prev) => ({ ...prev, status }));
        return;
      }
      if (ev.event === 'error') {
        const message =
          ev.data && typeof ev.data === 'object' &&
          typeof (ev.data as { message?: unknown }).message === 'string'
            ? ((ev.data as { message: string }).message)
            : 'cloud stream error';
        setState((prev) => ({ ...prev, error: message }));
        return;
      }
      const agentEvent = toAgentEvent(ev);
      if (agentEvent === null) return;
      setState((prev) => {
        if (prev.events.some((existing) => existing.seq === agentEvent.seq)) return prev;
        const next = [...prev.events, agentEvent].sort((a, b) => a.seq - b.seq);
        return { ...prev, events: next };
      });
    });

    bridge
      .cloudRunsStreamStart({ orgSlug, projectSlug, runId: cloudRunId })
      .then(({ subscriptionId: subId }) => {
        if (cancelled) {
          void bridge.cloudRunsStreamStop(subId);
          return;
        }
        subscriptionId = subId;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : String(err),
        }));
      });

    return () => {
      cancelled = true;
      if (unsubscribeBridge) unsubscribeBridge();
      if (subscriptionId !== null) {
        void bridge.cloudRunsStreamStop(subscriptionId);
      }
    };
  }, [orgSlug, projectSlug, cloudRunId]);

  return state;
}
