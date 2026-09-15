import { useEffect, useState } from 'react';
import type { AgentEvent, AgentRunStatus, Card } from '../types.js';
import type { IssueActiveRun } from '../types.js';

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
  pendingDecision: IssueActiveRun['pendingDecision'];
}

const EMPTY_STATE: AgentRunStreamState = {
  events: [],
  cards: [],
  status: null,
  error: null,
  pendingDecision: null,
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
// containment_warning), plus decision for the cloud transport. Unknown
// types are dropped — adding new event types is a server change that ships
// with renderer code anyway.
const KNOWN_AGENT_EVENT_TYPES = new Set([
  'tool_use',
  'tool_result',
  'text',
  'error',
  'containment_warning',
  'decision',
]);

function pendingDecisionFromEvent(
  data: unknown,
  cardId: number,
): NonNullable<IssueActiveRun['pendingDecision']> | null {
  if (!data || typeof data !== 'object') return null;
  const payload = (data as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') return null;
  const question = (payload as { question?: unknown }).question;
  const options = (payload as { options?: unknown }).options;
  if (typeof question !== 'string' || !Array.isArray(options)) return null;
  const validOptions = options
    .filter(
      (option): option is { value: string; label?: unknown } =>
        typeof option === 'object' &&
        option !== null &&
        typeof (option as { value?: unknown }).value === 'string',
    )
    .map((option) => ({
      value: option.value,
      label: typeof option.label === 'string' ? option.label : option.value,
    }));
  if (validOptions.length === 0) return null;
  return { cardId, question, options: validOptions };
}

function decisionText(decision: NonNullable<IssueActiveRun['pendingDecision']>): string {
  return [
    `Decision needed: ${decision.question}`,
    ...decision.options.map((option) => `- ${option.label} (value: ${option.value})`),
  ].join('\n');
}

function isTerminalEvent(event: string): boolean {
  return (
    event === 'decision_answer' ||
    event === 'result' ||
    event === 'terminal' ||
    event === 'stopped' ||
    event === 'stop_signal' ||
    event === 'closed' ||
    event === 'error'
  );
}

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
  /** Issue number for the shared pending-decision shape. */
  cardId?: number;
}

export function useCloudRunStream(opts: UseCloudRunStreamOpts): AgentRunStreamState {
  const { orgSlug, projectSlug, cloudRunId, cardId = 0 } = opts;
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
        setState((prev) => ({ ...prev, error: msg.error ?? null, pendingDecision: null }));
        return;
      }
      if (msg.done === true) {
        // server flagged terminal — leave events in place; status already
        // arrived via the prior `closed` event.
        setState((prev) => ({ ...prev, pendingDecision: null }));
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
        setState((prev) => ({
          ...prev,
          ...(status !== null ? { status } : {}),
          pendingDecision: null,
        }));
        return;
      }
      if (ev.event === 'error') {
        const message =
          ev.data &&
          typeof ev.data === 'object' &&
          typeof (ev.data as { message?: unknown }).message === 'string'
            ? (ev.data as { message: string }).message
            : 'cloud stream error';
        setState((prev) => ({ ...prev, error: message, pendingDecision: null }));
        return;
      }
      if (isTerminalEvent(ev.event)) {
        setState((prev) => ({ ...prev, pendingDecision: null }));
        return;
      }
      if (ev.event === 'decision') {
        const decision = pendingDecisionFromEvent(ev.data, cardId);
        if (decision === null) return;
        const agentEvent = toAgentEvent({
          ...ev,
          event: 'text',
          data: {
            ...((ev.data ?? {}) as object),
            payload: { text: decisionText(decision) },
          },
        });
        setState((prev) => ({
          ...prev,
          ...(agentEvent !== null && !prev.events.some((existing) => existing.seq === agentEvent.seq)
            ? { events: [...prev.events, agentEvent].sort((a, b) => a.seq - b.seq) }
            : {}),
          pendingDecision: decision,
        }));
        return;
      }
      const agentEvent = toAgentEvent(ev);
      if (agentEvent === null) return;
      setState((prev) => {
        if (prev.events.some((existing) => existing.seq === agentEvent.seq)) return prev;
        const next = [...prev.events, agentEvent].sort((a, b) => a.seq - b.seq);
        return {
          ...prev,
          events: next,
          ...(agentEvent.type === 'tool_use' || agentEvent.type === 'text'
            ? { pendingDecision: null }
            : {}),
        };
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
  }, [orgSlug, projectSlug, cloudRunId, cardId]);

  return state;
}
