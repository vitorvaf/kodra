import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { AgentUsageResult, UsageWindowInfo } from '../../api.js';
import { PROVIDER_LABELS } from '../forms/ModelPicker.js';

export interface AgentUsageRowProps {
  providers: AgentUsageResult[];
}

// Compact display names for the toolbar strip. PROVIDER_LABELS is the
// app-wide map, but its full spellings ("Antigravity CLI", "GitHub
// Copilot") are too wide at this density — the full names still surface
// in every tooltip.
const SHORT_LABELS: Record<string, string> = {
  'claude-code': 'Claude',
  'codex-cli': 'Codex',
  'agy-cli': 'Antigravity',
  'copilot-cli': 'Copilot',
};

// Expected window labels per agent, used to render ghost meters for
// degraded sources so a logged-out agent keeps the same footprint (and
// the same parallel 5h+7d rhythm) as a live one.
const PLACEHOLDER_WINDOWS: Record<string, string[]> = {
  'claude-code': ['5h', '7d'],
  'codex-cli': ['5h', '7d'],
  'agy-cli': ['weekly'],
  'copilot-cli': ['monthly'],
};

function fullLabel(provider: string): string {
  return PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider;
}

function shortLabel(provider: string): string {
  return SHORT_LABELS[provider] ?? fullLabel(provider);
}

/**
 * Subscription-usage strip for the board toolbar: one compact cluster per
 * agent (name + that agent's rate-limit windows), flowing horizontally and
 * wrapping as whole clusters on narrow widths. The backend always returns
 * every tracked agent in a fixed order, so the row's shape is stable
 * whether an agent is live, logged out, or unavailable.
 */
export function AgentUsageRow({ providers }: AgentUsageRowProps) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 3,
        rowGap: 1,
        mx: 3,
        mb: 2,
        px: 2,
        py: 1.25,
        borderRadius: 1.5,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {providers.length === 0 ? (
        // Cloud mode (or before the first local snapshot lands): keep the
        // row's footprint with a single quiet placeholder meter.
        <EmptyMeter label="Usage" title="Usage unavailable" />
      ) : (
        providers.map((agent) => <AgentCluster key={agent.provider} agent={agent} />)
      )}
    </Stack>
  );
}

function AgentCluster({ agent }: { agent: AgentUsageResult }) {
  const degraded = agent.source !== 'live';
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', opacity: degraded ? 0.6 : 1 }}>
      <Tooltip title={nameTitle(agent)}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {shortLabel(agent.provider)}
        </Typography>
      </Tooltip>
      {degraded ? (
        (PLACEHOLDER_WINDOWS[agent.provider] ?? ['usage']).map((label) => (
          <EmptyMeter key={label} label={label} title={nameTitle(agent)} />
        ))
      ) : agent.windows.length === 0 ? (
        // Live but windowless (e.g. an unlimited plan) — a quiet plan-only
        // note instead of an empty gap.
        <Tooltip title={nameTitle(agent)}>
          <Typography variant="caption" color="text.secondary">
            {agent.plan ?? 'Unlimited'}
          </Typography>
        </Tooltip>
      ) : (
        agent.windows.map((win) => <UsageMeter key={win.id} agent={agent} win={win} />)
      )}
    </Stack>
  );
}

function nameTitle(agent: AgentUsageResult): string {
  const full = fullLabel(agent.provider);
  if (agent.source === 'unauthorized') return `Log in to ${full} to see usage`;
  if (agent.source === 'unavailable') return `${full} usage unavailable`;
  if (agent.windows.length === 0) {
    const note = agent.plan
      ? `${agent.plan} plan · no rate-limit windows`
      : 'no rate-limit windows';
    return `${full} · ${note}`;
  }
  return agent.plan ? `${full} · ${agent.plan} plan` : full;
}

const meterLabelSx = {
  fontFamily: 'var(--ff-mono, monospace)',
  textTransform: 'uppercase' as const,
  color: 'text.secondary',
};

function EmptyMeter({ label, title }: { label: string; title: string }) {
  return (
    <Tooltip title={title}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="caption" sx={meterLabelSx}>
          {label}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={0}
          color="secondary"
          sx={{ width: 64, height: 4, borderRadius: 2 }}
        />
        <Typography variant="caption" color="text.disabled">
          —
        </Typography>
      </Stack>
    </Tooltip>
  );
}

function UsageMeter({ agent, win }: { agent: AgentUsageResult; win: UsageWindowInfo }) {
  const pct = Math.max(0, Math.min(1, win.pct));
  const color = pct >= 0.9 ? 'error' : pct >= 0.7 ? 'warning' : 'primary';
  const display = `${Math.round(pct * 100)}%`;
  const reset = win.resetsAt ? formatResetCountdown(win.resetsAt) : null;
  // Details come in two flavors: a group name for agents with several
  // windows sharing a label ('Gemini models') — promoted to the visible
  // label — or an absolute usage fraction ('1498 / 1500') shown next to
  // the percentage.
  const detail = win.detail?.trim() || null;
  const groupName = detail !== null && !/^[d.,s/:%-]+$/.test(detail) ? detail : null;
  const label = groupName ?? win.label;
  const quota = groupName === null ? detail : null;
  const title = [
    nameTitle(agent),
    `${groupName ? `${groupName} · ${win.label}` : `${win.label} window`} · ${display} used`,
    quota,
    reset ? `Resets in ${reset} (${new Date(win.resetsAt as string).toLocaleString()})` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
  return (
    <Tooltip title={title}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="caption" sx={meterLabelSx}>
          {label}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={pct * 100}
          color={color}
          sx={{ width: 64, height: 4, borderRadius: 2 }}
        />
        <Typography variant="caption" sx={{ fontWeight: 600, color: `${color}.main` }}>
          {display}
        </Typography>
        {quota ? (
          <Typography variant="caption" color="text.secondary">
            {quota}
          </Typography>
        ) : null}
        {reset ? (
          <Box component="span" sx={{ display: { xs: 'none', lg: 'inline' } }}>
            <Typography variant="caption" color="text.secondary">
              Resets in {reset}
            </Typography>
          </Box>
        ) : null}
      </Stack>
    </Tooltip>
  );
}

// Countdown until the reset boundary, in the user's local frame of
// reference. Examples: "1 hr 55 min", "23 min", "2 d 3 hr", "<1 min".
function formatResetCountdown(iso: string): string {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return '';
  const ms = target - Date.now();
  if (ms <= 0) return 'now';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return '<1 min';
  if (totalMin < 60) return `${totalMin} min`;
  const totalHr = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  if (totalHr < 24) return remMin === 0 ? `${totalHr} hr` : `${totalHr} hr ${remMin} min`;
  const days = Math.floor(totalHr / 24);
  const remHr = totalHr % 24;
  return remHr === 0 ? `${days} d` : `${days} d ${remHr} hr`;
}
