import { useState, type MouseEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { IconsaxIcon } from '@kanbots/ui';
import { ArrowDown2, Sort } from 'iconsax-react';

export interface BoardFiltersStats {
  issues: number;
  runs: number;
  awaiting: number;
  costToday: number;
}

export type BoardSortMode = 'manual' | 'priority' | 'createdAt' | 'updatedAt';

/**
 * Saved view surface for the filter row. Kept narrow so BoardFilters
 * doesn't have to know the persistence layer — Board.tsx owns the
 * `useBoardViews` hook and passes a presentation-only API down.
 */
export interface BoardFiltersViewsAPI {
  views: ReadonlyArray<{ id: string; name: string }>;
  activeViewId: string | null;
  matchedViewId: string | null;
  onPickView: (id: string | null) => void;
  onSaveAsView: (name: string) => void;
  onManageViews: () => void;
}

export interface BoardFiltersControls {
  hasAgent: boolean;
  priorities: ReadonlySet<string>;
  areas: ReadonlySet<string>;
  availablePriorities: readonly string[];
  availableAreas: readonly string[];
  includeBacklog: boolean;
  /** Number of issues in the (hidden) backlog — null hides the toggle when 0. */
  backlogCount: number;
  sortMode: BoardSortMode;
  onToggleHasAgent: () => void;
  onTogglePriority: (p: string) => void;
  onToggleArea: (a: string) => void;
  onToggleIncludeBacklog: () => void;
  onChangeSortMode: (mode: BoardSortMode) => void;
  onClear: () => void;
  /** Optional — when wired, surfaces a "Views" dropdown next to Sort. */
  views?: BoardFiltersViewsAPI;
}

const SORT_LABEL: Record<BoardSortMode, string> = {
  manual: 'Manual',
  priority: 'Priority',
  createdAt: 'Newest',
  updatedAt: 'Recently active',
};

export interface BoardFiltersProps {
  stats: BoardFiltersStats;
  /** Pass null in cloud mode (phase 1) — only the Open pill + stats render. */
  controls: BoardFiltersControls | null;
}

/** A toggleable filter chip: filled + deletable when on, outlined when off. */
function FilterChip({
  label,
  on,
  onToggle,
  title,
  color = 'primary',
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  title?: string;
  color?: 'primary' | 'success';
}) {
  const chip = (
    <Chip
      label={label}
      size="small"
      color={on ? color : 'secondary'}
      variant={on ? 'light' : 'outlined'}
      onClick={onToggle}
      aria-pressed={on}
      {...(on ? { onDelete: onToggle } : {})}
    />
  );
  return title ? <Tooltip title={title}>{chip}</Tooltip> : chip;
}

/**
 * Filter row: "Open" scope + toggleable chips for backlog / has-agent /
 * priority / area, saved views, sort and a stats summary. Cloud mode passes
 * `controls={null}` until filter state and label parity land.
 */
export function BoardFilters({ stats, controls }: BoardFiltersProps) {
  const anyOn =
    controls !== null &&
    (controls.hasAgent || controls.priorities.size > 0 || controls.areas.size > 0);
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', px: 3, pb: 1.5, flexWrap: 'wrap', rowGap: 1 }}
    >
      <Tooltip title="Only open issues are loaded">
        <Chip label="Open" size="small" color="primary" variant="light" />
      </Tooltip>
      {controls !== null ? (
        <>
          {controls.backlogCount > 0 || controls.includeBacklog ? (
            <FilterChip
              label={controls.includeBacklog ? 'Backlog' : `Backlog (${controls.backlogCount})`}
              on={controls.includeBacklog}
              onToggle={controls.onToggleIncludeBacklog}
              title={
                controls.includeBacklog
                  ? 'Click to hide the Backlog column'
                  : `Click to show the Backlog column (${controls.backlogCount} hidden)`
              }
            />
          ) : null}
          <FilterChip
            label="Has agent"
            on={controls.hasAgent}
            onToggle={controls.onToggleHasAgent}
            color="success"
          />
          {controls.availablePriorities.map((p) => (
            <FilterChip
              key={p}
              label={`priority:${p}`}
              on={controls.priorities.has(p)}
              onToggle={() => controls.onTogglePriority(p)}
            />
          ))}
          {controls.availableAreas.slice(0, 4).map((area) => (
            <FilterChip
              key={area}
              label={area}
              on={controls.areas.has(area)}
              onToggle={() => controls.onToggleArea(area)}
            />
          ))}
          {anyOn ? (
            <Button size="small" color="secondary" onClick={controls.onClear}>
              Clear
            </Button>
          ) : null}
        </>
      ) : null}
      <Box sx={{ flex: 1 }} />
      {controls !== null && controls.views ? <ViewsMenu views={controls.views} /> : null}
      {controls !== null ? (
        <SortMenu mode={controls.sortMode} onChange={controls.onChangeSortMode} />
      ) : null}
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
        {stats.issues} issue{stats.issues === 1 ? '' : 's'} · {stats.runs} active run
        {stats.runs === 1 ? '' : 's'} · {stats.awaiting} awaiting
      </Typography>
    </Stack>
  );
}

function SortMenu({
  mode,
  onChange,
}: {
  mode: BoardSortMode;
  onChange: (mode: BoardSortMode) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const title =
    mode === 'manual'
      ? 'Manual sort lets you drag cards within a column (drag-reorder ships in a later milestone)'
      : `Sorting by ${SORT_LABEL[mode].toLowerCase()} — switch to Manual for drag-reorder`;
  return (
    <>
      <Tooltip title={title}>
        <Button
          size="small"
          color="secondary"
          startIcon={<IconsaxIcon icon={Sort} size={16} />}
          endIcon={<IconsaxIcon icon={ArrowDown2} size={14} />}
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          Sort: {SORT_LABEL[mode]}
        </Button>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {(Object.keys(SORT_LABEL) as BoardSortMode[]).map((m) => (
          <MenuItem
            key={m}
            selected={m === mode}
            onClick={() => {
              setAnchor(null);
              onChange(m);
            }}
          >
            {SORT_LABEL[m]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function ViewsMenu({ views }: { views: BoardFiltersViewsAPI }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [draftName, setDraftName] = useState('');

  const current =
    views.activeViewId !== null
      ? views.views.find((v) => v.id === views.activeViewId)
      : views.matchedViewId !== null
        ? views.views.find((v) => v.id === views.matchedViewId)
        : null;
  const label = current?.name ?? 'Custom';

  function close(): void {
    setAnchor(null);
    setSavePromptOpen(false);
    setDraftName('');
  }

  function pick(id: string): void {
    close();
    views.onPickView(id);
  }

  function commitSave(e?: MouseEvent<HTMLButtonElement>): void {
    e?.stopPropagation();
    const name = draftName.trim();
    if (name.length === 0) return;
    views.onSaveAsView(name);
    close();
  }

  return (
    <>
      <Tooltip title="Switch saved views">
        <Button
          size="small"
          color="secondary"
          endIcon={<IconsaxIcon icon={ArrowDown2} size={14} />}
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          View: {label}
        </Button>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={close}>
        {views.views.length === 0 ? (
          <ListSubheader sx={{ lineHeight: 2.5 }}>No saved views yet</ListSubheader>
        ) : (
          views.views.map((v) => (
            <MenuItem key={v.id} selected={current?.id === v.id} onClick={() => pick(v.id)}>
              {v.name}
            </MenuItem>
          ))
        )}
        <Divider />
        {savePromptOpen ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{ px: 2, py: 1 }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <TextField
              size="small"
              value={draftName}
              placeholder="View name"
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitSave();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setSavePromptOpen(false);
                  setDraftName('');
                }
              }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={commitSave}
              disabled={draftName.trim().length === 0}
            >
              Save
            </Button>
          </Stack>
        ) : (
          <MenuItem onClick={() => setSavePromptOpen(true)}>+ Save current as new view</MenuItem>
        )}
        <MenuItem
          onClick={() => {
            close();
            views.onManageViews();
          }}
        >
          Manage views…
        </MenuItem>
      </Menu>
    </>
  );
}
