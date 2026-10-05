import { useEffect, useId, useState } from 'react';
import type { MemoryStatus } from '@kanbots/api';
import { getBridge } from '../../desktop-bridge.js';
import Button from '@mui/material/Button';
import { ModalFrame } from './ModalFrame.js';

type MemoryState =
  | { kind: 'checking' }
  | { kind: 'ready'; status: MemoryStatus }
  | { kind: 'error' };

/** Shape of `workspace:get-memory` per the locked IPC contract. */
interface WorkspaceMemoryConfig {
  enabled: boolean;
  url: string;
  secret: string | null;
}

// The workspace:get-memory / workspace:set-memory channels join the typed
// BridgeChannels map in @kanbots/api in parallel work; until then, route
// them through the locked contract shapes so our call sites stay typed.
async function invokeWorkspaceMemory<T>(
  channel: 'workspace:get-memory' | 'workspace:set-memory',
  args: unknown,
): Promise<T> {
  const bridge = getBridge();
  if (!bridge) throw new Error('Electron bridge unavailable');
  return bridge.invoke(channel as never, args as never) as Promise<T>;
}

async function readMemoryStatus(): Promise<MemoryStatus> {
  const bridge = getBridge();
  if (!bridge) throw new Error('Electron bridge unavailable');
  return bridge.invoke('memory:status', undefined);
}

export interface MemorySettingsModalProps {
  onClose: () => void;
}

export function MemorySettingsModal({ onClose }: MemorySettingsModalProps) {
  const [state, setState] = useState<MemoryState>({ kind: 'checking' });
  // null while the workspace setting is loading (or failed to load).
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const switchId = useId();
  const labelId = `${switchId}-label`;
  const helpId = `${switchId}-help`;

  async function refreshStatus(): Promise<void> {
    setState({ kind: 'checking' });
    try {
      const status = await readMemoryStatus();
      setState({ kind: 'ready', status });
    } catch {
      setState({ kind: 'error' });
    }
  }

  async function refreshConfig(): Promise<void> {
    try {
      const config = await invokeWorkspaceMemory<WorkspaceMemoryConfig>(
        'workspace:get-memory',
        undefined,
      );
      setEnabled(config.enabled);
      setConfigError(false);
    } catch {
      setEnabled(null);
      setConfigError(true);
    }
  }

  useEffect(() => {
    void refreshStatus();
    void refreshConfig();
  }, []);

  async function handleToggle(): Promise<void> {
    if (enabled === null || saving) return;
    const previous = enabled;
    const next = !previous;
    setActionError(null);
    setEnabled(next); // optimistic; reverted on failure
    setSaving(true);
    try {
      const result = await invokeWorkspaceMemory<{ enabled: boolean }>('workspace:set-memory', {
        enabled: next,
      });
      setEnabled(result.enabled);
    } catch {
      setEnabled(previous);
      setActionError(
        next
          ? 'Couldn’t turn memory on — the setting is unchanged.'
          : 'Couldn’t turn memory off — the setting is unchanged.',
      );
    } finally {
      setSaving(false);
    }
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
    <ModalFrame
      title="Memory"
      ariaLabel="Memory settings"
      width={560}
      onClose={onClose}
      bodyClassName="kb-memory-body"
      footerHint={'Status is checked when this panel opens.'}
      actions={
        <>
          <Button
            color="secondary"
            onClick={() => {
              void refreshStatus();
              void refreshConfig();
            }}
            disabled={state.kind === 'checking'}
          >
            {state.kind === 'checking' ? 'Checking…' : 'Refresh'}
          </Button>
          <Button color="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="kb-memory-intro">
        <div className="kb-memory-kicker">Agent context</div>
        <h3>agentmemory</h3>
        <p>Optional memory server for context shared across dispatched agent runs.</p>
      </div>

      <div className="kb-memory-toggle">
        <button
          type="button"
          id={switchId}
          className={`kb-switch${saving ? ' is-pending' : ''}`}
          role="switch"
          aria-checked={enabled === true}
          aria-labelledby={labelId}
          aria-describedby={helpId}
          disabled={enabled === null || saving}
          onClick={() => void handleToggle()}
          title={saving ? 'Saving…' : undefined}
        >
          <span className="kb-switch-knob" aria-hidden="true" />
        </button>
        <div className="kb-memory-toggle-copy">
          <strong className="kb-memory-toggle-label" id={labelId}>
            Enable agent memory
          </strong>
          <small className="kb-memory-toggle-help" id={helpId}>
            Sessions and observations from dispatched agent runs are mirrored to the agentmemory
            server for cross-agent context.
          </small>
        </div>
      </div>

      {configError ? (
        <p className="kb-memory-error" role="alert">
          Couldn’t load this workspace’s memory setting.
        </p>
      ) : null}
      {actionError ? (
        <p className="kb-memory-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className={`kb-memory-status-group${enabled === false ? ' is-dimmed' : ''}`}>
        <div
          className={`kb-memory-status kb-memory-status--${badgeTone}`}
          title={tooltip}
          role="status"
          aria-live="polite"
        >
          <span className="kb-memory-dot" aria-hidden="true" />
          <span>{badgeLabel}</span>
        </div>

        {state.kind === 'ready' && status ? (
          <dl className="kb-memory-details">
            <div>
              <dt>Endpoint</dt>
              <dd>{status.url}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>{status.available ? 'Responding' : 'Not detected'}</dd>
            </div>
          </dl>
        ) : null}
        {state.kind === 'error' ? (
          <p className="kb-memory-error" role="alert">
            Couldn’t check agentmemory right now.
          </p>
        ) : null}
      </div>
    </ModalFrame>
  );
}
