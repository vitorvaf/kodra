import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBridge,
  UPDATER_CHANGED_CHANNEL,
  type UpdaterState,
} from '../../desktop-bridge.js';

// Auto-updater notices — renderer side.
//
// Surfaces exactly two states, both as non-modal corner chrome in the
// app's bottom-right notification gravity (same corner as the decision
// tray, following its card anatomy):
//   - 'downloading': a quiet mono pill with a micro progress track
//   - 'downloaded':  a small toast offering "Restart now"
// Every other status ('idle' | 'checking' | 'available' | 'not-available'
// | 'error') stays invisible by design — background noise, not UI.

// Defensive shape check: the emitter lives in the desktop lane, so a
// malformed payload is dropped instead of rendered.
function isUpdaterState(value: unknown): value is UpdaterState {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { status?: unknown }).status === 'string';
}

export function UpdaterToast() {
  const [state, setState] = useState<UpdaterState | null>(null);
  // Session-only dismissal: each *arrival* into 'downloaded' (a fresh
  // updater:changed transition into that status) bumps an arrival
  // counter; dismissing records which arrival was dismissed. A new
  // arrival re-shows the toast; nothing persists across launches.
  const arrivalRef = useRef(0);
  const prevStatusRef = useRef<string | null>(null);
  const [dismissedArrival, setDismissedArrival] = useState<number>(0);
  const [closing, setClosing] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const applyState = useCallback((next: UpdaterState) => {
    if (prevStatusRef.current !== 'downloaded' && next.status === 'downloaded') {
      arrivalRef.current += 1;
      setClosing(false); // a new arrival cancels any in-flight close
    }
    prevStatusRef.current = next.status;
    setState(next);
  }, []);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return; // browser-only dev — updater is desktop-only
    let alive = true;
    bridge
      .updaterGetState()
      .then((initial) => {
        if (alive && isUpdaterState(initial)) applyState(initial);
      })
      .catch(() => undefined);
    const unsubscribe = bridge.subscribe(UPDATER_CHANGED_CHANNEL, (payload) => {
      if (isUpdaterState(payload)) applyState(payload);
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [applyState]);

  if (!state) return null;

  const showPill = state.status === 'downloading';
  const showToast = state.status === 'downloaded' && dismissedArrival !== arrivalRef.current;
  if (!showPill && !showToast) return null;

  function dismiss(): void {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setDismissedArrival(arrivalRef.current);
      setClosing(false);
    }, 170);
  }

  async function install(): Promise<void> {
    if (restarting) return;
    setRestarting(true);
    try {
      // Quits the app and reinstalls — the renderer is torn down on
      // success, so there is no "done" state to render.
      await getBridge()?.updaterInstall();
    } catch {
      setRestarting(false);
    }
  }

  return (
    <div className="kb-app kb-updater">
      {showPill ? (
        <div
          className={`kb-upd-pill${typeof state.progress === 'number' ? '' : ' is-indeterminate'}`}
          role="progressbar"
          aria-label="Downloading Kodra update"
          aria-valuemin={0}
          aria-valuemax={100}
          {...(typeof state.progress === 'number'
            ? { 'aria-valuenow': Math.round(state.progress * 100) }
            : {})}
        >
          <span className="kb-upd-track" aria-hidden>
            <span className="kb-upd-fill" />
          </span>
          <span className="kb-upd-label">
            {typeof state.progress === 'number'
              ? `downloading ${Math.round(state.progress * 100)}%`
              : 'downloading…'}
          </span>
        </div>
      ) : null}
      {showToast ? (
        <div
          className={`kb-upd-toast${closing ? ' is-closing' : ''}`}
          role="status"
          aria-live="polite"
        >
          <div className="kb-upd-head">
            <span className="kb-upd-dot" aria-hidden />
            <span className="kb-upd-title">Update downloaded</span>
            <button
              type="button"
              className="kb-upd-close"
              aria-label="Dismiss update notice"
              title="Dismiss"
              onClick={dismiss}
            >
              ×
            </button>
          </div>
          <div className="kb-upd-body">
            <p className="kb-upd-line">
              {state.availableVersion ? (
                <span className="kb-upd-ver">{state.availableVersion}</span>
              ) : null}
              <span>installs the next time you quit Kodra.</span>
            </p>
            <button
              type="button"
              className="kb-upd-install"
              disabled={restarting}
              onClick={() => void install()}
            >
              {restarting ? 'Restarting…' : 'Restart now'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
