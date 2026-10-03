import { useDraggable } from '@dnd-kit/core';
import type { IssueRef } from '@kanbots/core';
import { memo, useEffect, useState, type MouseEvent } from 'react';
import { alpha, keyframes, type Theme } from '@mui/material/styles';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { IconsaxIcon } from '@kanbots/ui';
import { Hierarchy, MessageQuestion } from 'iconsax-react';
import { api } from '../api.js';
import { useFocusedRepo } from '../hooks/useFocusedRepo.js';
import { dispatchIssuesRefetch } from '../hooks/useIssues.js';
import {
  ageString,
  areaLabels,
  colorForLogin,
  priorityFromLabels,
  strippedBranch,
  tagFromLabels,
} from '../labels.js';
import type { Issue, IssueActiveRun, ShipStatus } from '../types.js';
import { agentColor, agentLabel, priorityColor, tagColor } from './board/boardStyle.js';

export function cardDragId(issueNumber: IssueRef): string {
  return `card:${issueNumber}`;
}

/**
 * Modifier flags surfaced to the host so it can decide between focus
 * (plain click) and multi-select (shift / cmd / ctrl click). The card
 * component itself stays oblivious to the policy — it just reports what
 * keys were held.
 */
export interface CardSelectModifiers {
  shiftKey: boolean;
  metaOrCtrlKey: boolean;
}

export interface CardProps {
  issue: Issue;
  selected?: boolean;
  /** Highlight ring used by the multi-select bulk action bar. */
  multiSelected?: boolean;
  draggable?: boolean;
  liveTool?: { name: string; arg: string | null } | null;
  onSelect?: (issueNumber: IssueRef, modifiers: CardSelectModifiers) => void;
  onOpen?: (issueNumber: IssueRef) => void;
}

const pulse = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.35; }
  100% { opacity: 1; }
`;

const chipSx = { height: 20, fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.02em' };
const monoSx = { fontFamily: 'var(--ff-mono, monospace)' };

function CardBody({
  issue,
  liveTool,
  onReviewAction,
}: {
  issue: Issue;
  liveTool: CardProps['liveTool'];
  onReviewAction?: () => void;
}) {
  const tag = tagFromLabels(issue.labels, issue.isPullRequest);
  const priority = priorityFromLabels(issue.labels);
  const stateColor = agentColor(issue.agent);
  const stateLabel = agentLabel(issue.agent);
  const active: IssueActiveRun | null = issue.activeRun ?? null;
  const branch = strippedBranch(active?.branch);
  const isRunning = issue.agent === 'running';
  const isBlocked = issue.agent === 'blocked';
  const isReview = issue.agent === 'review';
  const tickerName = liveTool?.name ?? active?.currentTool ?? null;
  const tickerArg = liveTool?.arg ?? active?.currentArg ?? null;
  const decision = active?.pendingDecision ?? null;
  const checks = active?.checks ?? null;
  const stats =
    active && typeof active.additions === 'number' && typeof active.deletions === 'number'
      ? { add: active.additions, del: active.deletions }
      : null;
  const progress = active?.progress ?? null;
  const areas = areaLabels(issue.labels);

  return (
    <Stack spacing={1.25}>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
      >
        {tag ? (
          <Chip label={tag} size="small" color={tagColor(tag)} variant="outlined" sx={chipSx} />
        ) : null}
        <Typography variant="caption" color="text.secondary" sx={monoSx}>
          #{issue.number}
        </Typography>
        {priority ? (
          <Chip
            label={priority.toUpperCase()}
            size="small"
            color={priorityColor(priority)}
            variant="light"
            sx={chipSx}
          />
        ) : null}
        {issue.sentryMeta ? (
          <Tooltip
            title={`Sentry · ${issue.sentryMeta.count} occurrence${issue.sentryMeta.count === 1 ? '' : 's'}`}
          >
            <Chip
              label={`Sentry${issue.sentryMeta.status === 'analyzed' ? ' · reviewed' : ''}`}
              size="small"
              color={issue.sentryMeta.status === 'analyzed' ? 'secondary' : 'error'}
              variant="light"
              sx={chipSx}
            />
          </Tooltip>
        ) : null}
        {stateColor && stateLabel ? (
          <Chip
            size="small"
            color={stateColor}
            variant="light"
            label={stateLabel}
            icon={
              <Box
                component="span"
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: 'currentColor',
                  ml: '6px !important',
                  ...(isRunning && { animation: `${pulse} 1.4s ease-in-out infinite` }),
                }}
              />
            }
            sx={{ ...chipSx, ml: 'auto !important' }}
          />
        ) : null}
      </Stack>

      <Typography variant="subtitle1" sx={{ lineHeight: 1.35, wordBreak: 'break-word' }}>
        {issue.title}
      </Typography>

      {isRunning && tickerName ? (
        <Stack
          direction="row"
          spacing={1}
          aria-label="Agent is running"
          sx={{
            alignItems: 'center',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            bgcolor: (t: Theme) => alpha(t.palette.success.main, 0.08),
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'success.main',
              flexShrink: 0,
              animation: `${pulse} 1.4s ease-in-out infinite`,
            }}
          />
          <Typography variant="caption" sx={{ ...monoSx, color: 'success.main', fontWeight: 600 }}>
            {tickerName}
          </Typography>
          {tickerArg ? (
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ ...monoSx, minWidth: 0 }}
            >
              {tickerArg}
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      {isBlocked && decision ? (
        <Box
          aria-label="Agent question"
          sx={{
            p: 1.25,
            borderRadius: 1,
            border: 1,
            borderColor: (t: Theme) => alpha(t.palette.warning.main, 0.4),
            bgcolor: (t: Theme) => alpha(t.palette.warning.main, 0.08),
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mb: 1 }}>
            <Box sx={{ color: 'warning.main', display: 'flex', mt: '1px' }}>
              <IconsaxIcon icon={MessageQuestion} size={16} variant="Bulk" />
            </Box>
            <Typography variant="body2">{decision.question}</Typography>
          </Stack>
          <DecisionActions
            cardId={decision.cardId}
            options={decision.options}
            {...(typeof active?.cloudRunId === 'string' ? { cloudRunId: active.cloudRunId } : {})}
          />
        </Box>
      ) : null}

      {(isRunning || isReview) && progress !== null ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center' }}
          aria-label={`Progress ${Math.round(progress * 100)}%`}
        >
          <LinearProgress
            variant="determinate"
            color={isReview ? 'info' : 'success'}
            value={Math.max(0, Math.min(1, progress)) * 100}
            sx={{ flex: 1, height: 4, borderRadius: 2 }}
          />
          <Typography variant="caption" color="text.secondary" sx={monoSx}>
            {Math.round(progress * 100)}%
          </Typography>
        </Stack>
      ) : null}

      {isReview ? (
        <ReviewActions
          issueNumber={issue.number}
          isPullRequest={issue.isPullRequest}
          {...(onReviewAction ? { onAction: onReviewAction } : {})}
        />
      ) : null}

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
        {branch ? (
          <Tooltip title={active?.branch ?? ''}>
            <Chip
              size="small"
              variant="outlined"
              icon={<IconsaxIcon icon={Hierarchy} size={12} />}
              label={branch}
              sx={{ ...chipSx, ...monoSx, fontWeight: 400, maxWidth: 150 }}
            />
          </Tooltip>
        ) : null}
        {stats ? (
          <Typography variant="caption" sx={monoSx}>
            <Box component="span" sx={{ color: 'success.main' }}>
              +{stats.add}
            </Box>{' '}
            <Box component="span" sx={{ color: 'error.main' }}>
              −{stats.del}
            </Box>
          </Typography>
        ) : null}
        {areas.length > 0 && !branch && !stats ? (
          <Chip
            size="small"
            variant="outlined"
            label={areas[0]}
            sx={{ ...chipSx, fontWeight: 400 }}
          />
        ) : null}
        {checks ? (
          <Stack direction="row" spacing={0.5} aria-label="Checks">
            <CheckPill kind={checks.tests} label="tests" />
            <CheckPill kind={checks.typecheck} label="tsc" />
            <CheckPill kind={checks.lint} label="lint" />
          </Stack>
        ) : null}
        <Box sx={{ flex: 1 }} />
        {issue.subIssueCount && issue.subIssueCount > 0 ? (
          <Tooltip
            title={`${issue.subIssueCount} sub-issue${issue.subIssueCount === 1 ? '' : 's'}`}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              aria-label={`Has ${issue.subIssueCount} sub-issue${issue.subIssueCount === 1 ? '' : 's'}`}
            >
              ↳{issue.subIssueCount}
            </Typography>
          </Tooltip>
        ) : null}
        {issue.assignees.length > 0 ? (
          <AvatarGroup
            max={3}
            sx={{ '& .MuiAvatar-root': { width: 20, height: 20, fontSize: 10, borderWidth: 1 } }}
          >
            {issue.assignees.map((login) => (
              <Tooltip key={login} title={login}>
                <Avatar sx={{ bgcolor: colorForLogin(login) }}>
                  {login.slice(0, 1).toUpperCase()}
                </Avatar>
              </Tooltip>
            ))}
          </AvatarGroup>
        ) : null}
        <Typography variant="caption" color="text.secondary" sx={{ ...monoSx, flexShrink: 0 }}>
          {ageString(issue.updatedAt || issue.createdAt)}
        </Typography>
      </Stack>
    </Stack>
  );
}

function stopClick(e: MouseEvent<HTMLElement>): void {
  e.stopPropagation();
}

function ReviewActions({
  issueNumber,
  isPullRequest,
  onAction,
}: {
  issueNumber: IssueRef;
  isPullRequest: boolean;
  onAction?: () => void;
}) {
  const [shipOpen, setShipOpen] = useState(false);
  const { focusedRepoId } = useFocusedRepo();
  function toggleShip(e: MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();
    setShipOpen((v) => !v);
  }
  function requestChanges(e: MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();
    const request = isPullRequest
      ? api.requestChangesPullRequest(issueNumber)
      : api.requestChangesIssue(issueNumber);
    void request.then(() => {
      dispatchIssuesRefetch();
      onAction?.();
    });
  }
  function spawnReviewer(e: MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();
    void api
      .spawnReviewer(issueNumber, focusedRepoId !== null ? { repoId: focusedRepoId } : {})
      .then(() => {
        dispatchIssuesRefetch();
        onAction?.();
      });
  }
  function handleShipped(): void {
    setShipOpen(false);
    const request = isPullRequest
      ? api.approvePullRequest(issueNumber)
      : api.approveIssue(issueNumber);
    void request.then(() => {
      dispatchIssuesRefetch();
      onAction?.();
    });
  }
  return (
    <Stack spacing={1} onClick={stopClick} onPointerDown={stopClick}>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
        <Button size="small" variant="contained" onClick={toggleShip}>
          {shipOpen ? 'Cancel' : 'Ship…'}
        </Button>
        <Button size="small" variant="outlined" color="secondary" onClick={requestChanges}>
          Request changes
        </Button>
        <Button size="small" color="secondary" onClick={spawnReviewer}>
          Run reviewer
        </Button>
      </Stack>
      {shipOpen ? (
        <ShipPanel
          issueNumber={issueNumber}
          onShipped={handleShipped}
          onCancel={() => setShipOpen(false)}
        />
      ) : null}
    </Stack>
  );
}

function ShipPanel({
  issueNumber,
  onShipped,
  onCancel,
}: {
  issueNumber: IssueRef;
  onShipped: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<ShipStatus | null>(null);
  const [target, setTarget] = useState<string>('');
  const [busy, setBusy] = useState<null | 'merge' | 'pr'>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .shipStatus(issueNumber)
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setTarget(s.defaultMergeTarget);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [issueNumber]);

  async function ensureCommitted(): Promise<boolean> {
    if (!status?.hasUncommittedChanges) return true;
    const ok = window.confirm(
      'This worktree has uncommitted changes. Commit them automatically before shipping?',
    );
    if (!ok) return false;
    try {
      await api.shipCommit(issueNumber);
      const refreshed = await api.shipStatus(issueNumber);
      setStatus(refreshed);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function onMerge(e: MouseEvent<HTMLButtonElement>): Promise<void> {
    e.stopPropagation();
    if (!target) return;
    setBusy('merge');
    setError(null);
    if (!(await ensureCommitted())) {
      setBusy(null);
      return;
    }
    try {
      await api.shipMerge(issueNumber, target);
      onShipped();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onCreatePR(e: MouseEvent<HTMLButtonElement>): Promise<void> {
    e.stopPropagation();
    setBusy('pr');
    setError(null);
    if (!(await ensureCommitted())) {
      setBusy(null);
      return;
    }
    try {
      const result = await api.shipCreatePR({
        issueNumber,
        ...(target ? { targetBranch: target } : {}),
      });
      window.open(result.pr.htmlUrl, '_blank');
      onShipped();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (status === null && error === null) {
    return (
      <Typography variant="caption" color="text.secondary" aria-busy>
        Loading branch info…
      </Typography>
    );
  }

  return (
    <Stack spacing={1.25} sx={{ p: 1.25, borderRadius: 1, border: 1, borderColor: 'divider' }}>
      {status?.branchName ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            From
          </Typography>
          <Typography variant="caption" noWrap sx={{ ...monoSx, minWidth: 0 }}>
            {status.branchName}
          </Typography>
          {status.commitsAheadOfDefault > 0 ? (
            <Chip
              size="small"
              variant="light"
              color="info"
              sx={chipSx}
              label={`${status.commitsAheadOfDefault} commit${status.commitsAheadOfDefault === 1 ? '' : 's'} ahead`}
            />
          ) : null}
        </Stack>
      ) : null}
      <TextField
        select
        size="small"
        label="Target"
        id={`ship-target-${issueNumber}`}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        {(status?.availableTargets ?? []).map((b) => (
          <MenuItem key={b} value={b}>
            {b}
          </MenuItem>
        ))}
      </TextField>
      {status?.hasUncommittedChanges ? (
        <Alert severity="warning" sx={{ py: 0 }}>
          Worktree has uncommitted changes — you&rsquo;ll be asked before shipping.
        </Alert>
      ) : null}
      {error !== null ? (
        <Alert severity="error" role="alert" sx={{ py: 0 }}>
          {error}
        </Alert>
      ) : null}
      <Stack direction="row" spacing={0.75}>
        <Button
          size="small"
          variant="contained"
          disabled={busy !== null || !target}
          onClick={(e) => void onMerge(e)}
        >
          {busy === 'merge' ? 'Merging…' : 'Merge'}
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={busy !== null || !status?.branchName}
          onClick={(e) => void onCreatePR(e)}
        >
          {busy === 'pr' ? 'Opening PR…' : 'Open PR'}
        </Button>
        <Button
          size="small"
          color="secondary"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
        >
          Close
        </Button>
      </Stack>
    </Stack>
  );
}

const DECISION_RESOLVED_EVENT = 'kanbots:decision-resolved';

function DecisionActions({
  cardId,
  options,
  cloudRunId,
}: {
  cardId: number;
  options: Array<{ value: string; label: string }>;
  cloudRunId?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: MouseEvent<HTMLButtonElement>, value: string): Promise<void> {
    e.stopPropagation();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (cloudRunId !== undefined) {
        await api.resolveCard(cardId, value, { cloudRunId });
      } else {
        await api.resolveCard(cardId, value);
      }
      window.dispatchEvent(new CustomEvent(DECISION_RESOLVED_EVENT));
      dispatchIssuesRefetch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function dismiss(e: MouseEvent<HTMLButtonElement>): Promise<void> {
    e.stopPropagation();
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.dismissCard(cardId);
      window.dispatchEvent(new CustomEvent(DECISION_RESOLVED_EVENT));
      dispatchIssuesRefetch();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{ flexWrap: 'wrap', rowGap: 0.75 }}
      onClick={stopClick}
      onPointerDown={stopClick}
      role="group"
      aria-label="Decision options"
    >
      {options.map((opt) => (
        <Button
          key={opt.value}
          size="small"
          variant="outlined"
          color="warning"
          disabled={submitting}
          onClick={(e) => void pick(e, opt.value)}
        >
          {submitting ? '…' : opt.label}
        </Button>
      ))}
      <Tooltip title="Dismiss this decision and stop the run">
        <span>
          <Button
            size="small"
            color="secondary"
            disabled={submitting}
            onClick={(e) => void dismiss(e)}
          >
            Dismiss
          </Button>
        </span>
      </Tooltip>
      {error !== null ? (
        <Typography variant="caption" color="error" role="alert" sx={{ width: '100%' }}>
          {error}
        </Typography>
      ) : null}
    </Stack>
  );
}

function CheckPill({ kind, label }: { kind: 'pass' | 'fail' | 'running' | 'idle'; label: string }) {
  const color =
    kind === 'pass'
      ? 'success.main'
      : kind === 'fail'
        ? 'error.main'
        : kind === 'running'
          ? 'warning.main'
          : 'text.disabled';
  const icon = kind === 'pass' ? '✓' : kind === 'fail' ? '×' : kind === 'running' ? '↻' : '·';
  return (
    <Tooltip title={`${label}: ${kind}`}>
      <Box
        component="span"
        aria-label={`${label} ${kind}`}
        sx={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: 1,
          borderColor: color,
          color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {icon}
      </Box>
    </Tooltip>
  );
}

/** Card surface: state accent on the left, rings for focus and multi-select. */
function cardSx(issue: Issue, selected: boolean, multiSelected: boolean, dragging: boolean) {
  const accent = agentColor(issue.agent);
  return (t: Theme) => ({
    position: 'relative' as const,
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    p: 1.75,
    pl: accent ? 2 : 1.75,
    borderRadius: 1.5,
    border: '1px solid',
    borderColor: selected ? t.palette.primary.main : t.palette.divider,
    bgcolor: t.palette.background.paper,
    boxShadow: selected ? `0 0 0 1px ${t.palette.primary.main}` : 'none',
    outline: multiSelected ? `2px dashed ${t.palette.primary.main}` : 'none',
    outlineOffset: 2,
    opacity: dragging ? 0.4 : 1,
    cursor: 'pointer',
    transition: t.transitions.create(['border-color', 'box-shadow']),
    '&:hover': { borderColor: selected ? t.palette.primary.main : t.palette.secondary.light },
    '&:focus-visible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
    ...(accent && {
      '&::before': {
        content: '""',
        position: 'absolute' as const,
        left: 0,
        top: 10,
        bottom: 10,
        width: 3,
        borderRadius: '0 3px 3px 0',
        bgcolor: t.palette[accent].main,
      },
    }),
  });
}

function CardImpl({
  issue,
  selected = false,
  multiSelected = false,
  draggable = true,
  liveTool = null,
  onSelect,
  onOpen,
}: CardProps) {
  const drag = useDraggable({
    id: cardDragId(issue.number),
    disabled: !draggable,
  });

  function handleClick(e: MouseEvent<HTMLDivElement>): void {
    e.preventDefault();
    onSelect?.(issue.number, {
      shiftKey: e.shiftKey,
      metaOrCtrlKey: e.metaKey || e.ctrlKey,
    });
  }
  function handleDoubleClick(e: MouseEvent<HTMLDivElement>): void {
    e.preventDefault();
    onOpen?.(issue.number);
  }

  // A div with the drag attributes (role="button", tabIndex) instead of a
  // <button>: the review and decision actions nest real buttons inside.
  return (
    <Box
      ref={drag.setNodeRef}
      data-agent={issue.agent ?? undefined}
      sx={cardSx(issue, selected, multiSelected, drag.isDragging)}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      {...(draggable ? drag.listeners : {})}
      {...(draggable ? drag.attributes : { role: 'button', tabIndex: 0 })}
    >
      <CardBody issue={issue} liveTool={liveTool} />
    </Box>
  );
}

export const Card = memo(CardImpl, (prev, next) => {
  if (prev.selected !== next.selected) return false;
  if (prev.multiSelected !== next.multiSelected) return false;
  if (prev.draggable !== next.draggable) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.onOpen !== next.onOpen) return false;
  if (prev.liveTool?.name !== next.liveTool?.name) return false;
  if (prev.liveTool?.arg !== next.liveTool?.arg) return false;
  // Issue identity comparison: primitive fields that drive the visible card
  const a = prev.issue;
  const b = next.issue;
  if (String(a.number) !== String(b.number)) return false;
  if (a.title !== b.title) return false;
  if (a.isPullRequest !== b.isPullRequest) return false;
  if (a.updatedAt !== b.updatedAt) return false;
  if (a.agent !== b.agent) return false;
  if (a.status !== b.status) return false;
  if (a.labels.length !== b.labels.length) return false;
  if (a.assignees.length !== b.assignees.length) return false;
  if ((a.subIssueCount ?? 0) !== (b.subIssueCount ?? 0)) return false;
  // ActiveRun identity by id and core mutable fields. Include every field the
  // card body actually renders (branch, checks, decision, preview) so a late
  // backend update — e.g. branchName landing after status='starting' was first
  // visible — actually re-renders the card instead of being suppressed here.
  const ra = a.activeRun ?? null;
  const rb = b.activeRun ?? null;
  if (ra && rb) {
    if (
      ra.id !== rb.id ||
      ra.status !== rb.status ||
      ra.branch !== rb.branch ||
      ra.currentTool !== rb.currentTool ||
      ra.currentArg !== rb.currentArg ||
      ra.additions !== rb.additions ||
      ra.deletions !== rb.deletions ||
      ra.progress !== rb.progress ||
      ra.previewUrl !== rb.previewUrl ||
      ra.previewState !== rb.previewState ||
      ra.checks?.tests !== rb.checks?.tests ||
      ra.checks?.typecheck !== rb.checks?.typecheck ||
      ra.checks?.lint !== rb.checks?.lint
    ) {
      return false;
    }
    const da = ra.pendingDecision ?? null;
    const db = rb.pendingDecision ?? null;
    if (
      (da?.cardId ?? null) !== (db?.cardId ?? null) ||
      (da?.question ?? null) !== (db?.question ?? null) ||
      da?.options.length !== db?.options.length ||
      (da !== null &&
        db !== null &&
        da.options.some(
          (option, index) =>
            option.value !== db.options[index]?.value || option.label !== db.options[index]?.label,
        ))
    ) {
      return false;
    }
  } else if (ra !== rb) {
    return false;
  }
  // Sentry meta — re-render when status changes (e.g. after analyze)
  const sa = a.sentryMeta ?? null;
  const sb = b.sentryMeta ?? null;
  if (sa && sb ? sa.status !== sb.status || sa.count !== sb.count : sa !== sb) return false;
  return true;
});

export function CardPreview({
  issue,
  liveTool = null,
}: {
  issue: Issue;
  liveTool?: CardProps['liveTool'];
}) {
  return (
    <Box
      sx={(t: Theme) => ({
        ...cardSx(issue, false, false, false)(t),
        boxShadow: t.shadows[8],
        transform: 'rotate(2deg)',
        cursor: 'grabbing',
      })}
    >
      <CardBody issue={issue} liveTool={liveTool} />
    </Box>
  );
}
