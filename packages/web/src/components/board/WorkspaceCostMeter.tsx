import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { IconsaxIcon } from '@kanbots/ui';
import { DollarCircle } from 'iconsax-react';

export interface WorkspaceCostMeterProps {
  /** Sum of `totalCostUsd` across runs that started since midnight (local).
   *  Pass null while the first fetch is in flight so the meter renders an
   *  unobtrusive placeholder rather than flashing "$0.00". */
  totalUsd: number | null;
  /** Optional click handler — wires the meter to "Stats & cost" so users
   *  can drill into a breakdown. Omit to render a static, non-clickable
   *  meter (e.g. in a read-only context). */
  onClick?: (() => void) | undefined;
}

/**
 * Compact workspace-wide cost rollup in the board header. Reads from the
 * existing `cost:today` data source (sum of `total_cost_usd` across every
 * agent run since midnight); the parent Board page refreshes the value.
 *
 * The figure is what each CLI reports, priced at API list rates. Runs on a
 * subscription (Claude Code or ChatGPT sign-in) report the same figure but
 * are not billed per token, and Kodra can't tell which auth the CLI used —
 * so the meter reads as an estimate rather than a bill.
 */
export function WorkspaceCostMeter({ totalUsd, onClick }: WorkspaceCostMeterProps) {
  const empty = totalUsd === null;
  const zero = totalUsd === 0;
  const display = empty ? '—' : `≈ $${(totalUsd as number).toFixed(2)} today`;
  const title = empty
    ? 'Workspace cost today is still loading'
    : zero
      ? 'No agent runs have spent today yet'
      : `Estimated agent spend since midnight at API list prices: $${(totalUsd as number).toFixed(2)}. ` +
        'Runs on a Claude Code or ChatGPT subscription use your plan limits instead and are not billed per token.';
  return (
    <Tooltip title={title}>
      <Chip
        icon={<IconsaxIcon icon={DollarCircle} size={16} variant="Bulk" />}
        label={display}
        color={empty || zero ? 'secondary' : 'primary'}
        variant="light"
        aria-label={title}
        {...(onClick ? { onClick } : {})}
        sx={{ fontFamily: 'var(--ff-mono, monospace)', fontWeight: 600 }}
      />
    </Tooltip>
  );
}
