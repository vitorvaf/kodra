import { useState, type MouseEvent } from 'react';
import { Logo } from './Logo.js';
import { CloudSettingsModal } from './modals/CloudSettingsModal.js';
import { getBridge, type CloudStatusPayload } from '../desktop-bridge.js';

// Local-first launch: cloud sign-in is OPTIONAL. The prompt is dismissible
// via "Continue locally" or Escape; the dismissal is persisted through
// `kanbots:cloud-prompt-dismiss` so the user is not nagged again.
export interface CloudFirstRunPromptProps {
  onSignedIn: () => void;
  onDismissed: () => void;
}

const CheckIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M5 12l5 5L20 7" />
  </svg>
);

const HeroIcon = (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="13" y="3" width="8" height="6" rx="1.5" />
    <rect x="13" y="11" width="8" height="10" rx="1.5" fill="currentColor" opacity="0.85" />
  </svg>
);

/**
 * Local-first launch: shown on first run to introduce Kanbots Cloud as an
 * optional add-on. Users can sign in OR continue locally; either choice
 * dismisses the prompt for future sessions.
 */
export function CloudFirstRunPrompt({ onSignedIn, onDismissed }: CloudFirstRunPromptProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);

  function handleStatusChange(status: CloudStatusPayload): void {
    if (status.authed) onSignedIn();
  }

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  async function dismiss(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      // Persist dismissal so subsequent launches skip the prompt.
      // Best-effort — if the bridge is unavailable (browser-only dev)
      // we still propagate the dismissal up to the parent so the user
      // can keep working.
      const bridge = getBridge();
      if (bridge) {
        await bridge.cloudPromptDismiss().catch(() => undefined);
      }
    } finally {
      onDismissed();
    }
  }

  if (showSettings) {
    return (
      <CloudSettingsModal
        onClose={() => setShowSettings(false)}
        onChanged={handleStatusChange}
      />
    );
  }

  return (
    <div className="kb-modal-scrim" role="dialog" aria-modal="true">
      <div className="kb-cloud-modal" onMouseDown={stopInner}>
        <div className="kb-cloud-modal-head">
          <Logo size={14} />
          <span className="kb-cloud-modal-head-title">Welcome to kanbots</span>
          <span className="grow" />
        </div>

        <div className="kb-cloud-modal-body">
          <div className="kb-cloud-hero">
            <div className="kb-cloud-hero-icon" style={{ color: 'var(--accent)' }}>
              {HeroIcon}
            </div>
            <h2 className="kb-cloud-hero-title">Sign in to Kanbots Cloud?</h2>
            <p className="kb-cloud-hero-tagline">
              kanbots works fully offline on your machine. Kanbots Cloud is
              optional and adds team sync, cross-device boards, and shared
              run history.
            </p>
          </div>

          <ul
            className="kb-cloud-features"
            style={{ listStyle: 'none', padding: '12px 14px', margin: 0 }}
          >
            <li className="kb-cloud-feature">
              <span className="kb-cloud-feature-icon">{CheckIcon}</span>
              <span>Agents and code stay on your machine</span>
            </li>
            <li className="kb-cloud-feature">
              <span className="kb-cloud-feature-icon">{CheckIcon}</span>
              <span>Sync boards and runs across your team and devices</span>
            </li>
            <li className="kb-cloud-feature">
              <span className="kb-cloud-feature-icon">{CheckIcon}</span>
              <span>One account works on every device you install kanbots on</span>
            </li>
          </ul>

          <div className="kb-cloud-cta-row">
            <button
              type="button"
              className="kb-cloud-cta"
              onClick={() => setShowSettings(true)}
              disabled={busy}
            >
              Sign in to Kanbots Cloud
            </button>
            <button
              type="button"
              className="kb-cloud-cta-secondary"
              onClick={() => void dismiss()}
              disabled={busy}
            >
              Continue locally
            </button>
          </div>

          <p className="kb-cloud-fineprint">
            By continuing you agree to our{' '}
            <a href="https://app.kanbots.dev/terms" target="_blank" rel="noopener noreferrer">
              Terms
            </a>{' '}
            and{' '}
            <a href="https://app.kanbots.dev/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
