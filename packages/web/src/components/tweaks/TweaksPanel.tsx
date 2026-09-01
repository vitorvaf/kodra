import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import type { WorkspaceBudgets } from '../../types.js';
import type { Tweaks } from '../../hooks/useTweaks.js';

export interface TweaksPanelProps {
  tweaks: Tweaks;
  onSet: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
  onReset: () => void;
  onClose: () => void;
  onOpenPalette: () => void;
  onFocusPaused?: () => void;
  onFocusReview?: () => void;
  notifyOnRunComplete?: boolean;
  onSetNotifyOnRunComplete?: (enabled: boolean) => void;
}

export function TweaksPanel({
  tweaks,
  onSet,
  onReset,
  onClose,
  onOpenPalette,
  onFocusPaused,
  onFocusReview,
  notifyOnRunComplete,
  onSetNotifyOnRunComplete,
}: TweaksPanelProps) {
  return (
    <div className="kb-tweaks kb-app" role="dialog" aria-label="Tweaks">
      <div className="kb-tweaks-head">
        <span className="t">Tweaks</span>
        <span className="grow" />
        <button type="button" onClick={onReset} title="Reset to defaults" aria-label="Reset">
          ↺
        </button>
        <button type="button" onClick={onClose} title="Close" aria-label="Close">
          ×
        </button>
      </div>

      <div className="kb-tweaks-section">
        <div className="kb-tweaks-label">Theme</div>
        <div className="kb-tweaks-radio">
          {(['dark', 'paper'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={tweaks.theme === v ? 'on' : ''}
              onClick={() => onSet('theme', v)}
            >
              {v === 'dark' ? 'Dark' : 'Paper'}
            </button>
          ))}
        </div>
      </div>

      <div className="kb-tweaks-section">
        <div className="kb-tweaks-label">Accent hue</div>
        <div className="kb-tweaks-slider-row">
          <input
            type="range"
            className="kb-tweaks-slider"
            min={0}
            max={360}
            step={1}
            value={tweaks.accentHue}
            onChange={(e) => onSet('accentHue', Number.parseInt(e.target.value, 10))}
            aria-label="Accent hue"
          />
          <span style={{ width: 32, textAlign: 'right' }}>{tweaks.accentHue}°</span>
        </div>
      </div>

      <div className="kb-tweaks-section">
        <div className="kb-tweaks-label">Layout</div>
        <Toggle
          label="Sidebar"
          on={tweaks.showRail}
          onChange={(v) => onSet('showRail', v)}
        />
        <Toggle
          label="Decision tray"
          on={tweaks.showTray}
          onChange={(v) => onSet('showTray', v)}
        />
      </div>

      <BudgetsSection />

      {onSetNotifyOnRunComplete ? (
        <div className="kb-tweaks-section">
          <div className="kb-tweaks-label">Notifications</div>
          <Toggle
            label="Notify me when agents finish"
            on={notifyOnRunComplete !== false}
            onChange={(v) => onSetNotifyOnRunComplete(v)}
          />
        </div>
      ) : null}

      <div className="kb-tweaks-section">
        <div className="kb-tweaks-label">Try things</div>
        <div className="kb-tweaks-actions">
          <button type="button" onClick={onOpenPalette}>
            Open command palette (⌘K)
          </button>
          {onFocusPaused ? (
            <button type="button" onClick={onFocusPaused}>
              Focus a paused agent
            </button>
          ) : null}
          {onFocusReview ? (
            <button type="button" onClick={onFocusReview}>
              Focus a review-ready PR
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BudgetsSection() {
  const [budgets, setBudgets] = useState<WorkspaceBudgets | null>(null);
  const [runDraft, setRunDraft] = useState('');
  const [sessionDraft, setSessionDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getWorkspaceBudgets()
      .then((b) => {
        if (cancelled) return;
        setBudgets(b);
        setRunDraft(b.runCostBudgetUsd != null ? String(b.runCostBudgetUsd) : '');
        setSessionDraft(
          b.sessionCostBudgetUsd != null ? String(b.sessionCostBudgetUsd) : '',
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const runVal = parseBudget(runDraft);
      const sessionVal = parseBudget(sessionDraft);
      if (runVal === 'invalid' || sessionVal === 'invalid') {
        setError('Budgets must be positive numbers, or blank for unbounded.');
        return;
      }
      const next = await api.setWorkspaceBudgets({
        runCostBudgetUsd: runVal,
        sessionCostBudgetUsd: sessionVal,
      });
      setBudgets(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!budgets) {
    return (
      <div className="kb-tweaks-section">
        <div className="kb-tweaks-label">Cost budgets (USD)</div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="kb-tweaks-section">
      <div className="kb-tweaks-label">Cost budgets (USD)</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>
        Auto-stops a run or autopilot session when its spend hits the cap.
        Leave blank to disable.
      </div>
      <BudgetField
        label="Per run"
        value={runDraft}
        onChange={setRunDraft}
      />
      <BudgetField
        label="Per autopilot session"
        value={sessionDraft}
        onChange={setSessionDraft}
      />
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className="kb-btn"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save budgets'}
        </button>
        {error ? (
          <span style={{ color: 'var(--failed)', fontSize: 11 }}>{error}</span>
        ) : null}
      </div>
    </div>
  );
}

function BudgetField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        marginBottom: 6,
      }}
    >
      <span style={{ minWidth: 160 }}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder="unbounded"
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          padding: '4px 6px',
          background: 'var(--ink-bg)',
          color: 'var(--ink-1)',
          border: '1px solid var(--hairline)',
          borderRadius: 4,
          fontSize: 12,
        }}
      />
    </label>
  );
}

function parseBudget(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="kb-tweaks-toggle">
      <span>{label}</span>
      <span className="kb-tweaks-switch" data-on={on ? 'true' : 'false'} aria-hidden />
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </label>
  );
}
