export interface UsageWindow {
  pct: number;
  resetsAt: string | null;
}

export interface BoardUsageRowProps {
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
}

/**
 * Two stacked usage meters (5h + 7d windows) rendered identically in both
 * local and cloud modes. Pass `null` for either window to show a placeholder
 * — used in cloud mode until the cost-today endpoint lands (phase 2).
 */
export function BoardUsageRow({ fiveHour, sevenDay }: BoardUsageRowProps) {
  return (
    <div className="kb-usage-row">
      <UsageMeter label="5h" usage={fiveHour} />
      <UsageMeter label="7d" usage={sevenDay} />
    </div>
  );
}

function UsageMeter({ label, usage }: { label: string; usage: UsageWindow | null }) {
  if (usage === null) {
    return (
      <div className="kb-usage-meter is-empty" title={`${label} usage unavailable`}>
        <span className="kb-usage-label">{label}</span>
        <span className="kb-usage-bar" aria-hidden>
          <span className="kb-usage-bar-fill" style={{ width: '0%' }} />
        </span>
        <span className="kb-usage-pct">—</span>
      </div>
    );
  }
  const pct = Math.max(0, Math.min(1, usage.pct));
  const tone = pct >= 0.9 ? 'danger' : pct >= 0.7 ? 'warn' : 'ok';
  const display = `${Math.round(pct * 100)}%`;
  const reset = usage.resetsAt ? formatResetCountdown(usage.resetsAt) : null;
  const title = usage.resetsAt
    ? `${label} window · ${display} used · resets ${new Date(usage.resetsAt).toLocaleString()}`
    : `${label} window · ${display} used`;
  return (
    <div className={`kb-usage-meter tone-${tone}`} title={title}>
      <span className="kb-usage-label">{label}</span>
      <span className="kb-usage-bar" aria-hidden>
        <span className="kb-usage-bar-fill" style={{ width: `${pct * 100}%` }} />
      </span>
      <span className="kb-usage-pct">{display}</span>
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
