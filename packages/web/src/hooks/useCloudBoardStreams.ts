import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { RunLiveMap } from './useBoardAgentStreams.js';

/**
 * Cloud counterpart of useBoardAgentStreams. Subscribes to one SSE
 * stream per running cloud card and exposes currentTool / currentArg /
 * eventCount per local-side run key (`activeRun.id`, which the cloud
 * adapter sets to the card number). Returns the same `RunLiveMap` shape
 * so Column can merge cloud + local maps with a plain `new Map([...a,
 * ...b])` and call sites don't change.
 */

interface CloudRunEventMessage {
  subscriptionId: string;
  event?: { id: string; event: string; data: unknown };
  done?: boolean;
  error?: string;
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
      if (msg.error !== undefined || msg.done === true) return;
      const ev = msg.event;
      if (!ev) return;
      if (ev.event === 'connected' || ev.event === 'closed' || ev.event === 'error') return;
      setMap((prev) => {
        const cur = prev.get(key) ?? {
          currentTool: null,
          currentArg: null,
          pendingDecision: null,
          eventCount: 0,
        };
        const next = new Map(prev);
        if (ev.event === 'tool_use') {
          const data = (ev.data ?? {}) as { payload?: unknown };
          const payload = (data.payload ?? {}) as { name?: unknown; input?: unknown };
          next.set(key, {
            ...cur,
            currentTool: typeof payload.name === 'string' ? payload.name : cur.currentTool,
            currentArg: summarize(payload.input),
            eventCount: cur.eventCount + 1,
          });
        } else {
          next.set(key, { ...cur, eventCount: cur.eventCount + 1 });
        }
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
