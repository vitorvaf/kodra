import { useEffect, useState } from 'react';
import type { RecentActivityKind, RecentActivityPayload } from '@kanbots/api';
import { api } from '../../api.js';
import { getBridge } from '../../desktop-bridge.js';
import { ageString } from '../../labels.js';
import { CollapsibleSection } from './CollapsibleSection.js';

/**
 * Most-recent agent events across the entire workspace, fed by the
 * `analytics:recent-activity` channel. Renders as 8 compact rows with
 * a relative timestamp, a kind glyph, and a one-line summary so the
 * rail tells the user what their agents are doing without forcing
 * them to flip between issues.
 *
 * Each row is clickable: it asks the host to open the underlying
 * issue's detail modal via the same `onSelectIssue` callback the
 * WorkspaceTree uses.
 */

const POLL_INTERVAL_MS = 5_000;
const DEFAULT_LIMIT = 8;

function iconForKind(kind: RecentActivityKind): string {
  switch (kind) {
    case 'tool_use':
      return '⚙';
    case 'tool_result':
      return '✓';
    case 'started':
      return '▸';
    case 'completed':
      return '◉';
    case 'decision':
      return '?';
    case 'error':
      return '!';
    default:
      return '·';
  }
}

function toneForKind(kind: RecentActivityKind): string {
  switch (kind) {
    case 'error':
      return 'tone-error';
    case 'decision':
      return 'tone-awaiting';
    case 'completed':
      return 'tone-done';
    case 'started':
      return 'tone-running';
    default:
      return '';
  }
}

export interface ActivitySectionProps {
  /** Click handler for an activity row — opens the underlying issue. */
  onSelectIssue: (issueNumber: number) => void;
}

export function ActivitySection({ onSelectIssue }: ActivitySectionProps) {
  const bridge = getBridge();
  const [items, setItems] = useState<RecentActivityPayload[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    let skipUnregistered = false;
    async function tick(): Promise<void> {
      if (skipUnregistered) return;
      try {
        const list = await api.listRecentActivity({ limit: DEFAULT_LIMIT });
        if (cancelled) return;
        setItems(list);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // Cloud-only launch: no local workspace is open, so the
        // workspace-scoped analytics handler isn't registered. Treat
        // this exactly like a cloud bridge: hide the section instead
        // of polling forever and spamming the console.
        const msg = err instanceof Error ? err.message : String(err);
        // Match Electron's exact "No handler registered for 'channel'"
        // shape so a future channel rename doesn't silently start
        // showing the noise again.
        if (/No handler registered for '/.test(msg)) {
          skipUnregistered = true;
          setError(null);
          setItems(null);
          return;
        }
        setError(msg);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    // Pause polling while the tab is hidden so background workspaces
    // don't burn IPC. The next visible tick brings the feed back in
    // sync via the same handler.
    function onVisibility(): void {
      if (!document.hidden) void tick();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [bridge]);

  // Cloud mode has no local agent_events table to read; the rail section
  // hides itself rather than rendering empty. When the cloud backend
  // exposes a similar workspace-events query this guard can lift.
  if (!bridge) return null;
  if (items === null && error === null) return null;
  if (items !== null && items.length === 0) return null;

  return (
    <CollapsibleSection
      storageKey="activity"
      className="kb-rail-activity"
      label="Activity"
      trailing={
        items !== null ? (
          <span
            className="kb-rail-label-count"
            aria-label={`${items.length} recent events`}
          >
            {items.length}
          </span>
        ) : null
      }
    >
      {error !== null ? (
        <div className="kb-rail-activity-error">{error}</div>
      ) : null}
      {items !== null ? (
        <div className="kb-rail-activity-list">
          {items.map((ev) => (
            <button
              key={ev.id}
              type="button"
              className={`kb-rail-activity-row ${toneForKind(ev.kind)}`}
              onClick={() => onSelectIssue(ev.issueNumber)}
              title={`#${ev.issueNumber} · ${ev.summary}`}
            >
              <span className="kb-rail-activity-icon" aria-hidden>
                {iconForKind(ev.kind)}
              </span>
              <span className="kb-rail-activity-meta">
                <span className="kb-rail-activity-line">
                  <span className="kb-rail-activity-num">#{ev.issueNumber}</span>
                  <span className="kb-rail-activity-summary">{ev.summary}</span>
                </span>
              </span>
              <span className="kb-rail-activity-age">{ageString(ev.createdAt)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </CollapsibleSection>
  );
}
