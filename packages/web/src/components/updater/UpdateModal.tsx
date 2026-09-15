import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { getBridge, UPDATER_CHANGED_CHANNEL, type UpdaterState } from '../../desktop-bridge.js';
import { renderReleaseNotes } from '../../lib/markdown.js';
import { Logo } from '../Logo.js';

// Update decision modal — the first beat of the update flow.
//
// When a new version is DETECTED ('available'), the user is asked before
// anything touches the network: "Update now" hands off to updaterDownload()
// and the corner chrome (UpdaterToast pill → restart toast) owns everything
// from 'downloading' onward; "Remind me later" (or Escape / backdrop / ×)
// defers the question to the next app launch. macOS never sees this modal —
// unsigned builds can't self-install, so canInstall === false keeps it
// invisible there.
//
// Dismissal is session-only memory (refs, nothing persisted): the updater
// re-emits 'available' on every ~30min re-check and must not re-prompt.
// One exception — after a "Update now" click (a download was attempted), a
// later 'available' arrival for the same-or-newer version means the
// download never landed, so the dismissal resets and the user gets exactly
// one clean retry per attempt.

// Defensive shape check: mirrors UpdaterToast.isUpdaterState. The newer
// optional fields (releaseNotes, canInstall) don't need probing — a string
// status remains a sufficient viability test, and a malformed payload is
// dropped instead of rendered.
function isUpdaterState(value: unknown): value is UpdaterState {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { status?: unknown }).status === 'string';
}

// Loose "same-or-newer" version compare for the retry exception. Numeric
// per segment; a non-numeric segment (pre-release suffix etc.) falls back
// to lexicographic. Anything unparseable counts as newer — a redundant
// prompt beats a stuck one.
function isNewerOrEqual(candidate: string, baseline: string): boolean {
  if (candidate === baseline) return true;
  const c = candidate.split('.');
  const b = baseline.split('.');
  for (let i = 0; i < Math.max(c.length, b.length); i++) {
    const cs = c[i] ?? '';
    const bs = b[i] ?? '';
    const cn = Number.parseInt(cs, 10);
    const bn = Number.parseInt(bs, 10);
    if (Number.isNaN(cn) || Number.isNaN(bn)) return cs >= bs;
    if (cn !== bn) return cn > bn;
  }
  return true;
}

export function UpdateModal() {
  const [state, setState] = useState<UpdaterState | null>(null);
  // Session-only dismissal, kept in a ref so the subscription callback
  // always reads the fresh value (no stale-closure re-prompts). The tick
  // mirror re-renders when the ref mutates from a click handler — the
  // retry path re-renders anyway via setState(next) in the same batch.
  const dismissedRef = useRef(false);
  const [, bumpTick] = useState(0);
  const setDismissed = useCallback((value: boolean) => {
    dismissedRef.current = value;
    bumpTick((tick) => tick + 1);
  }, []);
  // The version an "Update now" click attempted this session. Powers the
  // retry exception; consumed once it has triggered a re-prompt.
  const attemptedRef = useRef<string | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  const applyState = useCallback(
    (next: UpdaterState) => {
      if (next.status === 'available' && dismissedRef.current) {
        const attempted = attemptedRef.current;
        if (attempted !== null && isNewerOrEqual(next.availableVersion ?? '', attempted)) {
          // The download we started this session never landed — un-dismiss
          // so the user can retry, and consume the attempt so a second
          // decline (without a new "Update now") stays quiet.
          attemptedRef.current = null;
          setDismissed(false);
        }
      }
      setState(next);
    },
    [setDismissed],
  );

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

  // Renders for 'available' only — never for the statuses the corner
  // chrome already owns ('downloading', 'downloaded') — and never on
  // platforms that can't self-install (canInstall === false, macOS).
  const visible =
    state !== null &&
    state.status === 'available' &&
    state.canInstall !== false &&
    !dismissedRef.current;

  // Land keyboard focus inside the dialog when it opens. The card is a
  // silent anchor (outline suppressed); the buttons keep their rings.
  useEffect(() => {
    if (visible) cardRef.current?.focus();
  }, [visible]);

  // Escape = "Remind me later", same dismissal contract as every other
  // dismissable modal in the app (e.g. AutopilotLaunchModal).
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setDismissed(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, setDismissed]);

  // Electron-updater's GitHub Atom feed may deliver release notes as HTML;
  // renderReleaseNotes whitelist-sanitizes those notes while keeping the
  // escape-first markdown path safe (lib/markdown.ts).
  const notesHtml = useMemo(
    () => (state?.releaseNotes ? renderReleaseNotes(state.releaseNotes) : ''),
    [state?.releaseNotes],
  );

  if (state === null || !visible) return null;

  function remindLater(): void {
    setDismissed(true);
  }

  function updateNow(): void {
    // Record the attempt before anything async: if the download never
    // lands and a later 'available' arrives for this version or newer,
    // the retry exception re-opens the modal.
    attemptedRef.current = state?.availableVersion ?? '';
    setDismissed(true);
    // Progress belongs to the corner chrome from here — the modal's job
    // ends the moment the download starts.
    void getBridge()
      ?.updaterDownload()
      .catch(() => undefined);
  }

  // Backdrop press defers like Escape. mousedown + target check (not
  // click) so drag-selecting release notes out of the card can't dismiss
  // — the same guard the newer settings modals use.
  function onBackdropPress(e: MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) remindLater();
  }

  return (
    <div
      className="kb-upd-overlay kb-app"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={onBackdropPress}
    >
      <div className="kb-upd-modal" ref={cardRef} tabIndex={-1}>
        <div className="kb-upd-m-head">
          <Logo size={14} />
          <span className="kb-upd-m-title">Update available</span>
          <span className="kb-upd-m-grow" />
          <button
            type="button"
            className="kb-upd-m-x"
            aria-label="Remind me later"
            title="Remind me later"
            onClick={remindLater}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="kb-upd-m-body">
          <div className="kb-upd-hero">
            <div className="kb-upd-hero-icon" aria-hidden>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            </div>
            {state.availableVersion ? (
              <>
                <h2 className="kb-upd-vers" id={titleId}>
                  <span className="kb-upd-vers-from">{state.currentVersion}</span>
                  <span className="kb-upd-vers-arrow" aria-hidden>
                    →
                  </span>
                  <span className="kb-upd-vers-to">{state.availableVersion}</span>
                </h2>
                <p className="kb-upd-hero-tag">A new version of Kodra is ready to download.</p>
              </>
            ) : (
              // Defensive: 'available' without a version still gets a
              // coherent headline, just without the transition.
              <h2 className="kb-upd-vers" id={titleId}>
                <span className="kb-upd-vers-to">A new version of Kodra</span>
              </h2>
            )}
          </div>

          <div className="kb-upd-notes-label">What&rsquo;s new</div>
          <div className="kb-upd-notes">
            {notesHtml ? (
              <div dangerouslySetInnerHTML={{ __html: notesHtml }} />
            ) : (
              <p className="kb-upd-notes-fallback">Bug fixes and performance improvements.</p>
            )}
          </div>
        </div>

        <div className="kb-upd-m-foot">
          <span className="kb-upd-m-hint">
            The download runs in the background — you can keep working.
          </span>
          <span className="kb-upd-m-grow" />
          <button type="button" className="kb-upd-later" onClick={remindLater}>
            Remind me later
          </button>
          <button type="button" className="kb-upd-cta" onClick={updateNow}>
            Update now
          </button>
        </div>
      </div>
    </div>
  );
}
