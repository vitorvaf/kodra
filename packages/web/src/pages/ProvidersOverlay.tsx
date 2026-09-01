import { useState } from 'react';
import { getBridge } from '../desktop-bridge.js';

export interface ProvidersOverlayProps {
  reason: 'none' | 'all-failed';
  /** Called when sign-in/setup completes — caller should refetch provider status. */
  onConfigured: () => void;
}

type Pending = 'claude' | 'codex' | null;

/**
 * Non-dismissible overlay shown when no AI provider is configured (or all
 * configured providers failed validation on startup). Spec: high-contrast
 * warning, primary CTA → Settings → Providers; sidebar/composer/dispatch
 * remain disabled until at least one provider is configured.
 */
export function ProvidersOverlay({ reason, onConfigured }: ProvidersOverlayProps) {
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: 'claude' | 'codex'): Promise<void> {
    const bridge = getBridge();
    if (!bridge) {
      setError('Desktop bridge not available — open the desktop app instead.');
      return;
    }
    setPending(provider);
    setError(null);
    const result =
      provider === 'claude'
        ? await bridge.claudeLoginStart()
        : await bridge.codexLoginStart();
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onConfigured();
  }

  return (
    <>
      <div
        className="kb-providers-overlay"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="providers-overlay-title"
      >
        <div className="kb-providers-overlay-card">
          <div className="kb-providers-overlay-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 22h20L12 2z" />
              <path d="M12 9v6M12 18v.01" />
            </svg>
          </div>
          <h1 id="providers-overlay-title" className="kb-providers-overlay-title">
            {reason === 'all-failed'
              ? 'AI provider authentication failed'
              : 'Kanbots needs an AI provider to work'}
          </h1>
          <p className="kb-providers-overlay-body">
            {reason === 'all-failed'
              ? 'Every configured provider failed validation. Sign in again to continue.'
              : 'Sign in with your Claude Code or Codex subscription to continue.'}
          </p>
          <div className="kb-providers-overlay-actions">
            <button
              type="button"
              className="kb-btn primary"
              onClick={() => void signIn('claude')}
              disabled={pending !== null}
            >
              {pending === 'claude' ? 'Waiting for browser…' : 'Sign in with Claude Code'}
            </button>
            <button
              type="button"
              className="kb-btn primary"
              onClick={() => void signIn('codex')}
              disabled={pending !== null}
            >
              {pending === 'codex' ? 'Waiting for browser…' : 'Sign in with Codex'}
            </button>
          </div>
          {error ? (
            <div className="kb-sentry-error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
