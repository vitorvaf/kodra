import { useEffect, useState, type MouseEvent } from 'react';
import type { MemoryStatus } from '@kanbots/api';
import { Logo } from '../Logo.js';
import { getBridge } from '../../desktop-bridge.js';

type MemoryState =
  | { kind: 'checking' }
  | { kind: 'ready'; status: MemoryStatus }
  | { kind: 'error' };

export interface MemorySettingsModalProps {
  onClose: () => void;
}

async function readMemoryStatus(): Promise<MemoryStatus> {
  const bridge = getBridge();
  if (!bridge) throw new Error('Electron bridge unavailable');
  return bridge.invoke('memory:status', undefined);
}

export function MemorySettingsModal({ onClose }: MemorySettingsModalProps) {
  const [state, setState] = useState<MemoryState>({ kind: 'checking' });

  async function refresh(): Promise<void> {
    setState({ kind: 'checking' });
    try {
      const status = await readMemoryStatus();
      setState({ kind: 'ready', status });
    } catch {
      setState({ kind: 'error' });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function stopInner(event: MouseEvent<HTMLDivElement>): void {
    event.stopPropagation();
  }

  const status = state.kind === 'ready' ? state.status : null;
  const badgeLabel =
    state.kind === 'checking'
      ? 'checking…'
      : state.kind === 'error'
        ? 'checking failed'
        : status?.available
          ? `agentmemory running · ${status.version ? `v${status.version}` : 'version unknown'}`
          : 'agentmemory not detected';
  const badgeTone =
    state.kind === 'ready' && status?.available
      ? 'running'
      : state.kind === 'ready'
        ? 'missing'
        : 'neutral';
  const tooltip = status?.available
    ? 'agentmemory is the memory layer for dispatched agents.'
    : 'Optional memory server for cross-run context; see Settings.';

  return (
    <div
      className="kb-modal-scrim kb-app"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Memory settings"
    >
      <div className="kb-modal kb-memory-modal" onClick={stopInner}>
        <div className="kb-modal-head">
          <Logo size={11} withWordmark />
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <h2>Memory</h2>
          <span className="grow" />
          <button type="button" className="x-btn" onClick={onClose} aria-label="Close (Esc)" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="kb-modal-body kb-memory-body">
          <div className="kb-memory-intro">
            <div className="kb-memory-kicker">Agent context</div>
            <h3>agentmemory</h3>
            <p>Optional memory server for context shared across dispatched agent runs.</p>
          </div>

          <div className={`kb-memory-status kb-memory-status--${badgeTone}`} title={tooltip} role="status" aria-live="polite">
            <span className="kb-memory-dot" aria-hidden="true" />
            <span>{badgeLabel}</span>
          </div>

          {state.kind === 'ready' && status ? (
            <dl className="kb-memory-details">
              <div><dt>Endpoint</dt><dd>{status.url}</dd></div>
              <div><dt>Availability</dt><dd>{status.available ? 'Responding' : 'Not detected'}</dd></div>
            </dl>
          ) : null}
          {state.kind === 'error' ? (
            <p className="kb-memory-error" role="alert">Couldn’t check agentmemory right now.</p>
          ) : null}
        </div>

        <div className="kb-modal-foot">
          <span className="hint">Status is checked when this panel opens.</span>
          <span className="grow" />
          <button type="button" className="kb-btn ghost" onClick={() => void refresh()} disabled={state.kind === 'checking'}>
            {state.kind === 'checking' ? 'Checking…' : 'Refresh'}
          </button>
          <button type="button" className="kb-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
