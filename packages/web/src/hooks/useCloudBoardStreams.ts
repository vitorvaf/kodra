import { useEffect, useRef, useState } from 'react';
import type { RunLiveMap } from './useBoardAgentStreams.js';
import type { IssueActiveRun } from '../types.js';

/**
 * Cloud counterpart of useBoardAgentStreams. Subscribes to one SSE
 * stream per running cloud card and exposes currentTool / currentArg /
 * currentTool / currentArg per local-side run key (`activeRun.id`, which the
 * cloud adapter sets to the card number). Returns the same `RunLiveMap` shape
 * so Column can merge cloud + local maps with a plain `new Map([...a,
 * ...b])` and call sites don't change.
 */

interface CloudRunEventMessage {
  subscriptionId: string;
  event?: { id: string; event: string; data: unknown };
  done?: boolean;
  error?: string;
}

function pendingDecisionFromEvent(
  key: number,
  data: unknown,
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
  return { cardId: key, question, options: validOptions };
}

function clearDecisionEvent(event: string): boolean {
  return (
    event === 'decision_answer' ||
    event === 'result' ||
    event === 'terminal' ||
    event === 'stopped' ||
    event === 'stop_signal' ||
    event === 'error' ||
    event === 'closed'
  );
}

export interface CloudBoardEntry {
  /** Local-side key: cloud cards use `card.number` for activeRun.id. */
  key: number;
  cloudRunId: string;
}

interface ActiveSub {
  key: number;
  cloudRunId: string;
  subscriptionId: string | null;
  pendingCancel: boolean;
}

function summarize(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return null;
  }
}

export function useCloudBoardStreams(
  orgSlug: string | null,
  projectSlug: string | null,
  entries: readonly CloudBoardEntry[],
): RunLiveMap {
  const [map, setMap] = useState<RunLiveMap>(() => new Map());
  const subsByKey = useRef<Map<number, ActiveSub>>(new Map());
  const keyBySubId = useRef<Map<string, number>>(new Map());

  // Stable string key for the effect's dep so we only resync when the
  // set of running cloud cards actually changes.
  const entryKey = entries.map((e) => `${e.key}:${e.cloudRunId}`).join(',');

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
    if (!bridge || orgSlug === null || projectSlug === null) return;

    const wanted = new Map<number, string>();
    for (const e of entries) wanted.set(e.key, e.cloudRunId);

    // Tear down subs that are no longer wanted (card moved off the board,
    // run terminated, or the cloud run id rotated).
    for (const [key, sub] of subsByKey.current) {
      const stillWantedRunId = wanted.get(key);
      if (stillWantedRunId === sub.cloudRunId) continue;
      subsByKey.current.delete(key);
      if (sub.subscriptionId !== null) {
        keyBySubId.current.delete(sub.subscriptionId);
        void bridge.cloudRunsStreamStop(sub.subscriptionId);
      } else {
        sub.pendingCancel = true;
      }
      setMap((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }

    // Start subs for newly running cards.
    // A fresh subscription does not send Last-Event-ID. The cloud client has
    // no separate run-events fetch API, so this relies on the server's fresh
    // stream replay behavior; an awaiting decision already emitted by a
    // non-replaying server cannot be backfilled from the client.
    for (const [key, cloudRunId] of wanted) {
      const existing = subsByKey.current.get(key);
      if (existing && existing.cloudRunId === cloudRunId) continue;
      const sub: ActiveSub = {
        key,
        cloudRunId,
        subscriptionId: null,
        pendingCancel: false,
      };
      subsByKey.current.set(key, sub);
      bridge
        .cloudRunsStreamStart({ orgSlug, projectSlug, runId: cloudRunId })
        .then(({ subscriptionId }) => {
          if (sub.pendingCancel || subsByKey.current.get(key) !== sub) {
            void bridge.cloudRunsStreamStop(subscriptionId);
            return;
          }
          sub.subscriptionId = subscriptionId;
          keyBySubId.current.set(subscriptionId, key);
        })
        .catch(() => {
          // Drop the slot so the next render can retry.
          if (subsByKey.current.get(key) === sub) subsByKey.current.delete(key);
        });
    }
  }, [orgSlug, projectSlug, entryKey]);

  // Single bridge listener; demultiplexes by subscriptionId.
  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
    if (!bridge) return undefined;
    const unsub = bridge.subscribe('kanbots:cloud:run-event', (raw) => {
      const msg = raw as CloudRunEventMessage;
      const key = keyBySubId.current.get(msg.subscriptionId);
      if (key === undefined) return;
      if (msg.error !== undefined || msg.done === true) {
        setMap((prev) => {
          const cur = prev.get(key);
          if (cur === undefined || cur.pendingDecision === null) return prev;
          const next = new Map(prev);
          next.set(key, { ...cur, pendingDecision: null });
          return next;
        });
        return;
      }
      const ev = msg.event;
      if (!ev) return;
      if (clearDecisionEvent(ev.event)) {
        setMap((prev) => {
          const cur = prev.get(key);
          if (cur === undefined || cur.pendingDecision === null) return prev;
          const next = new Map(prev);
          next.set(key, { ...cur, pendingDecision: null });
          return next;
        });
        return;
      }
      if (ev.event === 'connected') return;
      if (ev.event === 'text') {
        setMap((prev) => {
          const cur = prev.get(key);
          if (cur === undefined || cur.pendingDecision === null) return prev;
          const next = new Map(prev);
          next.set(key, { ...cur, pendingDecision: null });
          return next;
        });
        return;
      }
      if (ev.event === 'decision') {
        const pendingDecision = pendingDecisionFromEvent(key, ev.data);
        if (pendingDecision === null) return;
        setMap((prev) => {
          const cur = prev.get(key) ?? {
            currentTool: null,
            currentArg: null,
            pendingDecision: null,
          };
          const next = new Map(prev);
          next.set(key, { ...cur, pendingDecision });
          return next;
        });
        return;
      }
      if (ev.event !== 'tool_use') return;
      setMap((prev) => {
        const cur = prev.get(key) ?? {
          currentTool: null,
          currentArg: null,
          pendingDecision: null,
        };
        const next = new Map(prev);
        const data = (ev.data ?? {}) as { payload?: unknown };
        const payload = (data.payload ?? {}) as { name?: unknown; input?: unknown };
        next.set(key, {
          ...cur,
          currentTool: typeof payload.name === 'string' ? payload.name : cur.currentTool,
          currentArg: summarize(payload.input),
          pendingDecision: null,
        });
        return next;
      });
    });
    return () => unsub();
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
      const subs = subsByKey.current;
      if (bridge) {
        for (const sub of subs.values()) {
          if (sub.subscriptionId !== null) {
            void bridge.cloudRunsStreamStop(sub.subscriptionId);
          } else {
            sub.pendingCancel = true;
          }
        }
      }
      subs.clear();
      keyBySubId.current.clear();
    };
  }, []);

  return map;
}
