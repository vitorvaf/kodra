import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { IconsaxIcon } from '@kanbots/ui';
import { Add, Flash } from 'iconsax-react';
import { WorkspaceCostMeter } from './WorkspaceCostMeter.js';

export interface BoardToolbarProps {
  /** Breadcrumb trail: segments before the last are muted, the last is the page. */
  crumbs: ReadonlyArray<string>;
  onOpenAutopilot?: (() => void) | undefined;
  onCreate?: (() => void) | undefined;
  createLabel?: string | undefined;
  createKbd?: string | undefined;
  /** Disable the Autopilot button (cloud mode shows tooltip until the endpoint lands). */
  autopilotDisabled?: boolean | undefined;
  autopilotDisabledTitle?: string | undefined;
  /** Extra trailing action buttons — used by cloud mode for "Refresh" / "Switch workspace". */
  trailingActions?: ReactNode;
  /** Workspace-wide cost since midnight (sum of run totalCostUsd). Null
   *  while the first fetch is in flight; the meter dims to a placeholder
   *  rather than flashing "$0.00". Omit entirely to hide the meter. */
  costTodayUsd?: number | null | undefined;
  /** Optional handler invoked when the user clicks the cost meter —
   *  typically opens the Stats & cost modal. */
  onOpenCostMeter?: (() => void) | undefined;
}

/**
 * Board page header: breadcrumbs on the left, cost meter, Autopilot and
 * Create on the right. Search lives in the app bar.
 */
export function BoardToolbar({
  crumbs,
  onOpenAutopilot,
  onCreate,
  createLabel = 'New task',
  createKbd = 'N',
  autopilotDisabled = false,
  autopilotDisabledTitle,
  trailingActions,
  costTodayUsd,
  onOpenCostMeter,
}: BoardToolbarProps) {
  // Show the meter when the caller wires it up at all — `undefined` hides
  // it (used by hosts that don't have cost data yet); `null` keeps it
  // visible but in its loading-placeholder state.
  const showCostMeter = costTodayUsd !== undefined;
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: 'center', px: 3, pt: 2.5, pb: 1.5, flexWrap: 'wrap', rowGap: 1 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', minWidth: 0 }}>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Stack
              key={`${i}-${crumb}`}
              direction="row"
              spacing={1}
              sx={{ alignItems: 'baseline' }}
            >
              <Typography
                variant={last ? 'h4' : 'h5'}
                color={last ? 'text.primary' : 'text.secondary'}
                noWrap
              >
                {crumb}
              </Typography>
              {!last ? (
                <Typography variant="h5" color="text.disabled">
                  /
                </Typography>
              ) : null}
            </Stack>
          );
        })}
      </Stack>
      <Box sx={{ flex: 1 }} />
      {showCostMeter ? (
        <WorkspaceCostMeter totalUsd={costTodayUsd} onClick={onOpenCostMeter} />
      ) : null}
      <Tooltip
        title={autopilotDisabled ? (autopilotDisabledTitle ?? '') : 'Start an autopilot session'}
      >
        <span>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<IconsaxIcon icon={Flash} size={18} variant="Bulk" />}
            onClick={() => onOpenAutopilot?.()}
            disabled={autopilotDisabled}
          >
            Autopilot
          </Button>
        </span>
      </Tooltip>
      <Button
        variant="contained"
        startIcon={<IconsaxIcon icon={Add} size={18} />}
        onClick={() => onCreate?.()}
        endIcon={
          <Box
            component="kbd"
            sx={{
              fontSize: 11,
              fontFamily: 'var(--ff-mono, monospace)',
              px: 0.75,
              borderRadius: 0.5,
              bgcolor: 'rgba(255,255,255,0.18)',
            }}
          >
            {createKbd}
          </Box>
        }
      >
        {createLabel}
      </Button>
      {trailingActions}
    </Stack>
  );
}
