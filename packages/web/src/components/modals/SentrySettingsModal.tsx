import { Logo } from '../Logo.js';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { api } from '../../api.js';
import { dispatchIssuesRefetch } from '../../hooks/useIssues.js';
import type { SentryConfigInput, SentryConfigPayload } from '../../types.js';

export interface SentrySettingsModalProps {
  onClose: () => void;
}

const INTERVAL_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 60, label: 'Every minute' },
  { value: 300, label: 'Every 5 minutes' },
  { value: 900, label: 'Every 15 minutes' },
  { value: 1800, label: 'Every 30 minutes' },
  { value: 3600, label: 'Every hour' },
];

type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; project: { slug: string; name: string } }
  | { kind: 'error'; message: string };

type SyncState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; imported: number; updated: number; totalSeen: number }
  | { kind: 'error'; message: string };

export function SentrySettingsModal({ onClose }: SentrySettingsModalProps) {
  const [config, setConfig] = useState<SentryConfigPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [orgSlug, setOrgSlug] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('production');
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState(300);
  const [tokenDraft, setTokenDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [syncState, setSyncState] = useState<SyncState>({ kind: 'idle' });
  const tokenInputRef = useRef<HTMLInputElement | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const cfg = await api.getSentryConfig();
      setConfig(cfg);
      setEnabled(cfg.enabled);
      setOrgSlug(cfg.orgSlug ?? '');
      setProjectSlug(cfg.projectSlug ?? '');
      setEnvironmentFilter(cfg.environmentFilter ?? '');
      setPollIntervalSeconds(cfg.pollIntervalSeconds);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  const dirty = useMemo(() => {
    if (!config) return false;
    if (enabled !== config.enabled) return true;
    if ((orgSlug || null) !== (config.orgSlug ?? null)) return true;
    if ((projectSlug || null) !== (config.projectSlug ?? null)) return true;
    if ((environmentFilter || null) !== (config.environmentFilter ?? null)) return true;
    if (pollIntervalSeconds !== config.pollIntervalSeconds) return true;
    if (tokenDraft.length > 0) return true;
    return false;
  }, [config, enabled, orgSlug, projectSlug, environmentFilter, pollIntervalSeconds, tokenDraft]);

  async function handleSave(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const input: SentryConfigInput = {
        enabled,
        orgSlug: orgSlug.trim() || null,
        projectSlug: projectSlug.trim() || null,
        environmentFilter: environmentFilter.trim() || null,
        pollIntervalSeconds,
      };
      if (tokenDraft.length > 0) {
        input.token = tokenDraft;
      }
      const next = await api.saveSentryConfig(input);
      setConfig(next);
      setTokenDraft('');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTestState({ kind: 'running' });
    try {
      const args: { token?: string; orgSlug?: string; projectSlug?: string } = {};
      if (tokenDraft.length > 0) args.token = tokenDraft;
      if (orgSlug.trim()) args.orgSlug = orgSlug.trim();
      if (projectSlug.trim()) args.projectSlug = projectSlug.trim();
      const result = await api.testSentryConnection(args);
      setTestState({ kind: 'ok', project: result.project });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTestState({ kind: 'error', message });
    }
  }

  async function handleSyncNow(): Promise<void> {
    setSyncState({ kind: 'running' });
    try {
      const result = await api.syncSentryNow();
      setSyncState({
        kind: 'done',
        imported: result.imported,
        updated: result.updated,
        totalSeen: result.totalSeen,
      });
      const next = await api.getSentryConfig();
      setConfig(next);
      dispatchIssuesRefetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSyncState({ kind: 'error', message });
    }
  }

  return (
    <div
      className="kb-modal-scrim kb-app"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sentry settings"
    >
      <div className="kb-modal kb-sentry-modal" onClick={stopInner}>
        <div className="kb-modal-head">
          <Logo size={11} withWordmark />
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <h2>Sentry integration</h2>
          <span className="grow" />
          <button
            type="button"
            className="x-btn"
            onClick={onClose}
            aria-label="Close (Esc)"
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="kb-modal-body kb-sentry-body">
          {loading ? <div className="kb-sentry-row">Loading…</div> : null}

          {error ? (
            <div className="kb-sentry-error" role="alert">
              {error.message}
            </div>
          ) : null}

          {config && !loading ? (
            <>
              {config.tokenEncryption === 'plain' && config.hasToken ? (
                <div className="kb-sentry-warn" role="status">
                  Token is stored unencrypted (no system keyring detected). Set{' '}
                  <code>SENTRY_AUTH_TOKEN</code> in your shell to override at runtime.
                </div>
              ) : null}

              {config.lastError ? (
                <div className="kb-sentry-error" role="alert">
                  Last sync error: {config.lastError}
                </div>
              ) : null}

              <label className="kb-sentry-row kb-sentry-toggle">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEnabled(e.target.checked)}
                />
                <span>
                  <strong>Enabled</strong>
                  <small>Polls Sentry on the interval below; new errors land in Inbox.</small>
                </span>
              </label>

              <label className="kb-sentry-row">
                <span className="kb-sentry-label">Organization slug</span>
                <input
                  type="text"
                  value={orgSlug}
                  placeholder="my-org"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setOrgSlug(e.target.value)}
                />
              </label>

              <label className="kb-sentry-row">
                <span className="kb-sentry-label">Project slug</span>
                <input
                  type="text"
                  value={projectSlug}
                  placeholder="my-project"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setProjectSlug(e.target.value)}
                />
              </label>

              <label className="kb-sentry-row">
                <span className="kb-sentry-label">Auth token</span>
                <input
                  ref={tokenInputRef}
                  type="password"
                  value={tokenDraft}
                  placeholder={config.hasToken ? '•••••• (leave blank to keep)' : 'Sentry auth token'}
                  autoComplete="off"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTokenDraft(e.target.value)}
                />
              </label>
              <div className="kb-sentry-hint">
                Use a Sentry Internal Integration token with <code>project:read</code> + <code>event:read</code> scopes.
              </div>

              <label className="kb-sentry-row">
                <span className="kb-sentry-label">Environment filter</span>
                <input
                  type="text"
                  value={environmentFilter}
                  placeholder="production (leave blank for all)"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEnvironmentFilter(e.target.value)}
                />
              </label>

              <label className="kb-sentry-row">
                <span className="kb-sentry-label">Poll interval</span>
                <select
                  value={pollIntervalSeconds}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setPollIntervalSeconds(Number(e.target.value))
                  }
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="kb-sentry-status">
                <div>
                  <strong>Last sync:</strong>{' '}
                  {config.lastSyncedAt ? new Date(config.lastSyncedAt).toLocaleString() : 'never'}
                </div>
                {config.consecutiveAuthFailures > 0 ? (
                  <div className="kb-sentry-fail">
                    Consecutive auth failures: {config.consecutiveAuthFailures}
                  </div>
                ) : null}
              </div>

              <div className="kb-sentry-actions">
                <button
                  type="button"
                  className="kb-btn ghost"
                  onClick={() => void handleTest()}
                  disabled={testState.kind === 'running'}
                >
                  {testState.kind === 'running' ? 'Testing…' : 'Test connection'}
                </button>
                <button
                  type="button"
                  className="kb-btn ghost"
                  onClick={() => void handleSyncNow()}
                  disabled={syncState.kind === 'running' || !config.hasToken}
                  title={!config.hasToken ? 'Save a token first' : 'Run a sync now'}
                >
                  {syncState.kind === 'running' ? 'Syncing…' : 'Sync now'}
                </button>
              </div>

              {testState.kind === 'ok' ? (
                <div className="kb-sentry-ok">
                  ✓ Connected to <code>{testState.project.slug}</code> ({testState.project.name})
                </div>
              ) : null}
              {testState.kind === 'error' ? (
                <div className="kb-sentry-error">{testState.message}</div>
              ) : null}
              {syncState.kind === 'done' ? (
                <div className="kb-sentry-ok">
                  ✓ Imported {syncState.imported} new, refreshed {syncState.updated} (saw{' '}
                  {syncState.totalSeen}).
                </div>
              ) : null}
              {syncState.kind === 'error' ? (
                <div className="kb-sentry-error">{syncState.message}</div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="kb-modal-foot">
          <span className="hint">
            {config?.safeStorageAvailable === false
              ? 'No system keyring; tokens stored as plaintext in the local SQLite db.'
              : 'Token is encrypted via the OS keyring.'}
          </span>
          <span className="grow" />
          <button type="button" className="kb-btn ghost" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="kb-btn primary"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
