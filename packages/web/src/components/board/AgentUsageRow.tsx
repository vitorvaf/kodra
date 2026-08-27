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
  return (
    PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider
  );
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
  if (providers.length === 0) {
    // Cloud mode (or before the first local snapshot lands): keep the
    // row's footprint with a single quiet placeholder meter.
    return (
      <div className="kb-usage-row">
        <div className="kb-usage-meter is-empty" title="Usage unavailable">
          <span className="kb-usage-label">Usage</span>
          <span className="kb-usage-bar" aria-hidden>
            <span className="kb-usage-bar-fill" style={{ width: '0%' }} />
          </span>
          <span className="kb-usage-pct">—</span>
        </div>
      </div>
    );
  }
  return (
    <div className="kb-usage-row kb-usage-multi">
      {providers.map((agent) => (
        <AgentCluster key={agent.provider} agent={agent} />
      ))}
    </div>
  );
}

function AgentCluster({ agent }: { agent: AgentUsageResult }) {
  const degraded = agent.source !== 'live';
  return (
    <div className={`kb-usage-agent${degraded ? ' is-degraded' : ''}`}>
      <span className="kb-usage-agent-name" title={nameTitle(agent)}>
        {shortLabel(agent.provider)}
      </span>
      {degraded ? (
        (PLACEHOLDER_WINDOWS[agent.provider] ?? ['usage']).map((label) => (
          <div className="kb-usage-meter is-empty" key={label} title={nameTitle(agent)}>
            <span className="kb-usage-label">{label}</span>
            <span className="kb-usage-bar" aria-hidden>
              <span className="kb-usage-bar-fill" style={{ width: '0%' }} />
            </span>
            <span className="kb-usage-pct">—</span>
          </div>
        ))
      ) : agent.windows.length === 0 ? (
        // Live but windowless (e.g. an unlimited plan) — a quiet plan-only
        // note instead of an empty gap.
        <span className="kb-usage-unlimited" title={nameTitle(agent)}>
          {agent.plan ?? 'Unlimited'}
        </span>
      ) : (
        agent.windows.map((win) => <UsageMeter key={win.id} agent={agent} win={win} />)
      )}
    </div>
  );
}

function nameTitle(agent: AgentUsageResult): string {
  const full = fullLabel(agent.provider);
  if (agent.source === 'unauthorized') return `Log in to ${full} to see usage`;
  if (agent.source === 'unavailable') return `${full} usage unavailable`;
  if (agent.windows.length === 0) {
    const note = agent.plan ? `${agent.plan} plan · no rate-limit windows` : 'no rate-limit windows';
    return `${full} · ${note}`;
  }
  return agent.plan ? `${full} · ${agent.plan} plan` : full;
}

function UsageMeter({ agent, win }: { agent: AgentUsageResult; win: UsageWindowInfo }) {
  const pct = Math.max(0, Math.min(1, win.pct));
  const tone = pct >= 0.9 ? 'danger' : pct >= 0.7 ? 'warn' : 'ok';
  const display = `${Math.round(pct * 100)}%`;
  const barWidth = `${Math.round(pct * 1000) / 10}%`;
  const reset = win.resetsAt ? formatResetCountdown(win.resetsAt) : null;
  // Details come in two flavors: a group name for agents with several
  // windows sharing a label ('Gemini models') — promoted to the visible
  // label — or an absolute usage fraction ('1498 / 1500') shown next to
  // the percentage.
  const detail = win.detail?.trim() || null;
  const groupName = detail !== null && !/^[\d.,\s/:%-]+$/.test(detail) ? detail : null;
  const label = groupName ?? win.label;
  const quota = groupName === null ? detail : null;
  const title = [
    nameTitle(agent),
    `${groupName ? `${groupName} · ${win.label}` : `${win.label} window`} · ${display} used`,
    quota,
    reset
      ? `Resets in ${reset} (${new Date(win.resetsAt as string).toLocaleString()})`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
  return (
    <div className={`kb-usage-meter tone-${tone}`} title={title}>
      <span className="kb-usage-label">{label}</span>
      <span className="kb-usage-bar" aria-hidden>
        <span className="kb-usage-bar-fill" style={{ width: barWidth }} />
      </span>
      <span className="kb-usage-pct">{display}</span>
      {quota ? <span className="kb-usage-quota">{quota}</span> : null}
      {reset ? <span className="kb-usage-reset">Resets in {reset}</span> : null}
    </div>
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
