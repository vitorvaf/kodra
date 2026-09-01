import { useState } from 'react';
import { getBridge } from '../desktop-bridge.js';

export function ClaudeLoginGate({ onAuthed }: { onAuthed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(): Promise<void> {
    const bridge = getBridge();
    if (!bridge) {
      setError('Desktop bridge not available — open the desktop app instead.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await bridge.claudeLoginStart();
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    onAuthed();
  }

  function cancel(): void {
    const bridge = getBridge();
    bridge?.claudeLoginCancel();
    setBusy(false);
  }

  return (
    <div className="picker">
      <div className="picker-card">
        <h1 className="picker-title">Sign in to Claude</h1>
        <p className="picker-sub">
          kanbots needs a Claude account to run agents. We&rsquo;ll open your browser to
          authorize.
        </p>
        <button
          type="button"
          className="picker-primary"
          onClick={() => void signIn()}
          disabled={busy}
        >
          {busy ? 'Waiting for browser…' : 'Sign in with Claude'}
        </button>
        {busy ? (
          <button type="button" className="picker-recent" onClick={cancel}>
            Cancel
          </button>
        ) : null}
        {error ? (
          <p className="composer-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
