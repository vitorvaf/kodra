import { useDroppable } from '@dnd-kit/core';
import type { IssueRef } from '@kanbots/core';
import { useEffect, useMemo, useState } from 'react';
import { alpha, type Theme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { IconButton, IconsaxIcon } from '@kanbots/ui';
import { Add, MagicStar } from 'iconsax-react';
import type { Issue, StatusKey } from '../types.js';
import { Card, type CardProps, type CardSelectModifiers } from './Card.js';
import { columnColor } from './board/boardStyle.js';
import type { RunLiveMap } from '../hooks/useBoardAgentStreams.js';

const NOOP_SELECT = (): void => undefined;
const NOOP_OPEN = (): void => undefined;

type LiveState = { currentTool: string | null; currentArg: string | null };
const cardLiveToolCache = new WeakMap<object, NonNullable<CardProps['liveTool']>>();

function cardLiveTool(live: LiveState | undefined): NonNullable<CardProps['liveTool']> | null {
  if (!live?.currentTool) return null;
  const cached = cardLiveToolCache.get(live);
  if (cached) return cached;
  const next = { name: live.currentTool, arg: live.currentArg };
  cardLiveToolCache.set(live, next);
  return next;
}

export function columnDropId(key: StatusKey | null): string {
  return `col:${key ?? 'inbox'}`;
}

export type SuggestActivity =
  | { kind: 'tool'; name: string; summary: string }
  | { kind: 'thought'; text: string };

export interface ColumnProps {
  columnKey: StatusKey | null;
  status: 'inbox' | StatusKey;
  label: string;
  issues: Issue[];
  selectedNumber?: IssueRef | null;
  /** Numbers of cards that are currently part of the bulk selection. */
  multiSelected?: ReadonlySet<IssueRef>;
  liveByRun?: RunLiveMap;
  onSelect?: (n: IssueRef, modifiers: CardSelectModifiers) => void;
  onOpen?: (n: IssueRef) => void;
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
  const selectedKeys = useMemo(() => {
    if (multiSelected === undefined) return undefined;
    const keys = new Set<string>();
    for (const n of multiSelected) keys.add(String(n));
    return keys;
  }, [multiSelected]);
  const selectCard = onSelect ?? NOOP_SELECT;
  const openCard = onOpen ?? NOOP_OPEN;
  const color = columnColor(status);

  return (
    <Box
      ref={setNodeRef}
      data-over={isOver ? 'true' : undefined}
      sx={(t: Theme) => ({
        width: 300,
        flex: '0 0 300px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderRadius: 2,
        bgcolor: isOver
          ? alpha(t.palette.primary.main, 0.06)
          : alpha(t.palette.secondary.main, t.palette.mode === 'dark' ? 0.06 : 0.04),
        border: '1px dashed',
        borderColor: isOver ? t.palette.primary.main : 'transparent',
        transition: t.transitions.create(['background-color', 'border-color']),
      })}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.75, pt: 1.5, pb: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: `${color}.main` }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Chip label={issues.length} size="small" sx={{ height: 20, fontSize: '0.6875rem' }} />
        <Box sx={{ flex: 1 }} />
        {onAdd ? (
          <Tooltip title="Add issue">
            <IconButton
              size="small"
              color="secondary"
              aria-label={`Add issue to ${label}`}
              onClick={() => onAdd(columnKey)}
            >
              <IconsaxIcon icon={Add} size={16} />
            </IconButton>
          </Tooltip>
        ) : null}
        {onSuggest ? (
          <Tooltip title={suggesting ? 'Claude is thinking…' : 'Ask Claude to suggest a feature'}>
            <span>
              <Button
                size="small"
                color="secondary"
                startIcon={<IconsaxIcon icon={MagicStar} size={14} variant="Bulk" />}
                aria-label={`Suggest a feature for ${label}`}
                aria-busy={suggesting || undefined}
                disabled={suggesting}
                onClick={onSuggest}
                sx={{ minWidth: 0, px: 1 }}
              >
                {suggesting ? 'Suggesting…' : 'Suggest'}
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </Stack>
      <Stack spacing={1.25} sx={{ px: 1.25, pb: 1.5, overflowY: 'auto', minHeight: 0, flex: 1 }}>
        {suggesting ? (
          <SuggestingSkeletonCard
            activity={suggestingActivity ?? []}
            startedAt={suggestingStartedAt}
          />
        ) : null}
        {issues.length === 0 && !suggesting ? (
          <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', py: 3 }}>
            No cards
          </Typography>
        ) : (
          issues.map((issue) => {
            const liveState = issue.activeRun ? liveByRun?.get(issue.activeRun.id) : undefined;
            const issueWithLiveDecision =
              issue.activeRun !== null && liveState !== undefined
                ? {
                    ...issue,
                    activeRun: {
                      ...issue.activeRun,
                      pendingDecision: liveState.pendingDecision,
                    },
                  }
                : issue;
            return (
              <Card
                key={String(issue.number)}
                issue={issueWithLiveDecision}
                selected={
                  selectedNumber !== null && String(selectedNumber) === String(issue.number)
                }
                multiSelected={selectedKeys?.has(String(issue.number)) ?? false}
                liveTool={cardLiveTool(liveState)}
                onSelect={selectCard}
                onOpen={openCard}
              />
            );
          })
        )}
      </Stack>
    </Box>
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
    <Box
      aria-busy="true"
      aria-label="Claude is suggesting a feature"
      sx={{
        p: 1.75,
        borderRadius: 1.5,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ mb: 1.25 }}>
        <Skeleton variant="rounded" width={34} height={18} />
        <Skeleton variant="rounded" width={44} height={18} />
      </Stack>
      <Skeleton variant="text" width="90%" />
      <Skeleton variant="text" width="60%" />
      <Box sx={{ mt: 1.25, pt: 1, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'success.main',
              flexShrink: 0,
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            Ideating…
          </Typography>
          {elapsed !== null ? (
            <Typography variant="caption" color="text.secondary">
              {elapsed}s
            </Typography>
          ) : null}
        </Stack>
        {lastTwo.length === 0 ? (
          <Typography variant="caption" color="text.disabled" component="div" sx={{ pl: 1.5 }}>
            starting…
          </Typography>
        ) : (
          lastTwo.map((ev, i) => (
            <Typography
              key={i}
              variant="caption"
              color="text.secondary"
              component="div"
              noWrap
              title={formatActivity(ev)}
              sx={{ pl: 1.5, fontFamily: 'var(--ff-mono, monospace)' }}
            >
              {formatActivity(ev)}
            </Typography>
          ))
        )}
      </Box>
    </Box>
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
