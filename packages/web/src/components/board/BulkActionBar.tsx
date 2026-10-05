import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { IconsaxIcon } from '@kanbots/ui';
import { ArrowDown2 } from 'iconsax-react';
import { STATUS_LABEL } from '../../labels.js';
import type { StatusKey } from '../../types.js';

export type BulkStatusTarget = StatusKey | null;

export interface BulkActionBarProps {
  /** Count of currently-selected cards; the bar mounts only when > 0. */
  count: number;
  busy: boolean;
  /** Move all selected cards to the given board status (null = Inbox). */
  onMoveToStatus: (status: BulkStatusTarget) => void;
  /** Append the given labels to all selected cards. */
  onAddLabels: (labels: string[]) => void;
  /** Dispatch agents on every selected card that's currently idle. */
  onDispatch: () => void;
  /** Archive every selected card. */
  onArchive: () => void;
  /** Clear the selection. */
  onClear: () => void;
}

const STATUS_TARGETS: ReadonlyArray<{ key: BulkStatusTarget; label: string }> = [
  { key: null, label: 'Inbox' },
  { key: 'backlog', label: STATUS_LABEL.backlog },
  { key: 'todo', label: STATUS_LABEL.todo },
  { key: 'inProgress', label: STATUS_LABEL.inProgress },
  { key: 'review', label: STATUS_LABEL.review },
  { key: 'done', label: STATUS_LABEL.done },
];

/**
 * Floating action bar at the bottom of the board while one or more cards
 * are multi-selected.
 */
export function BulkActionBar({
  count,
  busy,
  onMoveToStatus,
  onAddLabels,
  onDispatch,
  onArchive,
  onClear,
}: BulkActionBarProps) {
  return (
    <Paper
      elevation={8}
      role="region"
      aria-label={`Bulk actions for ${count} selected card${count === 1 ? '' : 's'}`}
      sx={{
        position: 'absolute',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 50,
        px: 2,
        py: 1,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ mr: 1, whiteSpace: 'nowrap' }}>
          {count} card{count === 1 ? '' : 's'} selected
        </Typography>
        <StatusMenu busy={busy} onPick={onMoveToStatus} />
        <LabelsPopover busy={busy} onApply={onAddLabels} />
        <Tooltip title="Start an agent run on each idle selected card">
          <span>
            <Button size="small" variant="contained" onClick={onDispatch} disabled={busy}>
              Dispatch
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Archive every selected card">
          <span>
            <Button size="small" color="error" onClick={onArchive} disabled={busy}>
              Archive
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Clear the selection">
          <span>
            <Button size="small" color="secondary" onClick={onClear} disabled={busy}>
              Clear
            </Button>
          </span>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

function StatusMenu({ busy, onPick }: { busy: boolean; onPick: (s: BulkStatusTarget) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title="Move every selected card to a status column">
        <span>
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            endIcon={<IconsaxIcon icon={ArrowDown2} size={14} />}
            onClick={(e) => setAnchor(e.currentTarget)}
            disabled={busy}
          >
            Move to
          </Button>
        </span>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {STATUS_TARGETS.map((t) => (
          <MenuItem
            key={String(t.key)}
            onClick={() => {
              setAnchor(null);
              onPick(t.key);
            }}
          >
            {t.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function LabelsPopover({ busy, onApply }: { busy: boolean; onApply: (labels: string[]) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState('');

  function close(): void {
    setAnchor(null);
  }

  function apply(): void {
    const labels = draft
      .split(',')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (labels.length === 0) return;
    onApply(labels);
    setDraft('');
    close();
  }

  return (
    <>
      <Tooltip title="Append labels to every selected card">
        <span>
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            endIcon={<IconsaxIcon icon={ArrowDown2} size={14} />}
            onClick={(e) => setAnchor(e.currentTarget)}
            disabled={busy}
          >
            Add labels
          </Button>
        </span>
      </Tooltip>
      <Popover
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, width: 280 }}>
          <TextField
            fullWidth
            size="small"
            label="Comma-separated"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="area:auth, priority:p1"
            spellCheck={false}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply();
              }
            }}
          />
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 1.5 }}>
            <Button size="small" color="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={apply}
              disabled={draft.trim().length === 0}
            >
              Apply
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
}
