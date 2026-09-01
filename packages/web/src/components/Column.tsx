import { useDroppable } from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import type { Issue, StatusKey } from '../types.js';
import { Card, type CardSelectModifiers } from './Card.js';
import type { RunLiveMap } from '../hooks/useBoardAgentStreams.js';

export function columnDropId(key: StatusKey | null): string {
  return `col:${key ?? 'inbox'}`;
}

const plusIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const sparkleIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </svg>
);

export type SuggestActivity =
  | { kind: 'tool'; name: string; summary: string }
  | { kind: 'thought'; text: string };

export interface ColumnProps {
  columnKey: StatusKey | null;
  status: 'inbox' | StatusKey;
  label: string;
  issues: Issue[];
  selectedNumber?: number | null;
  /** Numbers of cards that are currently part of the bulk selection. */
  multiSelected?: ReadonlySet<number>;
  liveByRun?: RunLiveMap;
  onSelect?: (n: number, modifiers: CardSelectModifiers) => void;
  onOpen?: (n: number) => void;
  onAdd?: (status: StatusKey | null) => void;
  onSuggest?: () => void;
  suggesting?: boolean;
  suggestingActivity?: SuggestActivity[];
  suggestingStartedAt?: string | null;
}

export function Column({
  columnKey,
  status,
  label,
  issues,
  selectedNumber = null,
  multiSelected,
  liveByRun,
  onSelect,
  onOpen,
  onAdd,
  onSuggest,
  suggesting = false,
  suggestingActivity,
  suggestingStartedAt = null,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(columnKey) });
  return (
    <div ref={setNodeRef} className="kb-col" data-over={isOver ? 'true' : undefined}>
      <div className="kb-col-head" data-status={status}>
        <span className="kb-col-glyph" aria-hidden />
        <span className="kb-col-name">{label}</span>
        <span className="kb-col-count">{issues.length}</span>
        {onAdd ? (
          <button
            type="button"
            className="kb-col-add"
            title="Add issue"
            aria-label={`Add issue to ${label}`}
            onClick={() => onAdd(columnKey)}
          >
            {plusIcon}
          </button>
        ) : null}
        {onSuggest ? (
          <button
            type="button"
            className="kb-col-suggest"
            title={suggesting ? 'Claude is thinking…' : 'Ask Claude to suggest a feature'}
            aria-label={`Suggest a feature for ${label}`}
            aria-busy={suggesting || undefined}
            disabled={suggesting}
            onClick={onSuggest}
          >
            {sparkleIcon}
            <span>{suggesting ? 'Suggesting…' : 'Suggest'}</span>
          </button>
        ) : null}
      </div>
      <div className="kb-col-list">
        {suggesting ? (
          <SuggestingSkeletonCard
            activity={suggestingActivity ?? []}
            startedAt={suggestingStartedAt}
          />
        ) : null}
        {issues.length === 0 && !suggesting ? (
          <div className="kb-col-empty">—</div>
        ) : (
          issues.map((issue) => {
            const live =
              issue.activeRun && liveByRun?.get(issue.activeRun.id)?.currentTool
                ? {
                    name: liveByRun.get(issue.activeRun.id)!.currentTool!,
                    arg: liveByRun.get(issue.activeRun.id)?.currentArg ?? null,
                  }
                : null;
            return (
              <Card
                key={issue.number}
                issue={issue}
                selected={selectedNumber === issue.number}
                multiSelected={multiSelected?.has(issue.number) ?? false}
                liveTool={live}
                onSelect={onSelect ?? (() => undefined)}
                onOpen={onOpen ?? (() => undefined)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function SuggestingSkeletonCard({
  activity,
  startedAt,
}: {
  activity: SuggestActivity[];
  startedAt: string | null;
}) {
  const lastTwo = activity.slice(-2);
  const elapsed = useElapsedSeconds(startedAt);
  return (
    <div className="kb-card kb-card-skeleton" aria-busy="true" aria-label="Claude is suggesting a feature">
      <div className="kb-card-row1">
        <span className="kb-skel kb-skel-num" />
        <span className="kb-skel kb-skel-tag" />
      </div>
      <div className="kb-skel kb-skel-line kb-skel-title" />
      <div className="kb-skel kb-skel-line kb-skel-line-short" />
      <div className="kb-card-meta">
        <span className="kb-skel kb-skel-pill" />
        <span className="kb-skel kb-skel-pill kb-skel-pill-sm" />
      </div>
      <div
        className="mono"
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid var(--hairline-soft)',
          fontSize: 11,
          color: 'var(--ink-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--running)',
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, color: 'var(--ink-2)' }}>Ideating…</span>
          {elapsed !== null ? <span>{elapsed}s</span> : null}
        </div>
        {lastTwo.length === 0 ? (
          <div style={{ paddingLeft: 12 }}>starting…</div>
        ) : (
          lastTwo.map((ev, i) => (
            <div
              key={i}
              style={{
                paddingLeft: 12,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={formatActivity(ev)}
            >
              {formatActivity(ev)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatActivity(ev: SuggestActivity): string {
  if (ev.kind === 'thought') return ev.text;
  return ev.summary ? `${ev.name} ${ev.summary}` : ev.name;
}

function useElapsedSeconds(startedAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.floor((now - start) / 1000));
}
