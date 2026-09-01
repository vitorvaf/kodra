import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';

export interface PreviewInspectSelection {
  tagName: string;
  id: string | null;
  className: string | null;
  textPreview: string;
  selector: string;
  reactComponent?: string;
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface PreviewPanelProps {
  activeRunId?: number;
  branch: string | null;
  worktreePath?: string | null;
  /** When `compact`, the preview canvas is shorter — use inside a tab pane. */
  size?: 'compact' | 'tall';
  /**
   * Called when the user finishes a click-to-component inspect interaction
   * in the preview iframe. Wiring this into the chat composer is downstream;
   * for now the panel just hands the selection back.
   */
  onInspectSelect?: (selection: PreviewInspectSelection) => void;
}

type DeviceMode = 'desktop' | 'mobile' | 'responsive';

const MOBILE_W = 390;
const MOBILE_H = 844;

export function PreviewPanel({
  activeRunId,
  branch,
  worktreePath,
  size = 'compact',
  onInspectSelect,
}: PreviewPanelProps) {
  const [state, setState] = useState<{
    url: string | null;
    upstreamUrl: string | null;
    state: 'idle' | 'booting' | 'live' | 'crashed' | 'stopped';
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceMode>('desktop');
  // URL bar lets the user navigate the preview to a sub-path. We keep an
  // explicit "loadedUrl" separate from "draftUrl" so typing doesn't
  // re-fetch the iframe on every keystroke; the user commits with Enter
  // or the submit button.
  const [draftUrl, setDraftUrl] = useState<string>('');
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [copyOk, setCopyOk] = useState(false);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const [inspectOn, setInspectOn] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!activeRunId) {
      setState(null);
      return;
    }
    let cancelled = false;
    api
      .getAgentRunPreview(activeRunId)
      .then((p) => {
        if (!cancelled) {
          setState({
            url: p.url,
            upstreamUrl: p.upstreamUrl ?? p.url,
            state: p.state,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeRunId]);

  async function start(): Promise<void> {
    if (!activeRunId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await api.startAgentRunPreview(activeRunId);
      setState({
        url: p.url,
        upstreamUrl: p.upstreamUrl ?? p.url,
        state: p.state,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function stop(): Promise<void> {
    if (!activeRunId || busy) return;
    setBusy(true);
    try {
      const p = await api.stopAgentRunPreview(activeRunId);
      setState({
        url: p.url,
        upstreamUrl: p.upstreamUrl ?? p.url,
        state: p.state,
      });
      setDevtoolsOpen(false);
      setInspectOn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const url = state?.url ?? null;
  const upstreamUrl = state?.upstreamUrl ?? url;
  const isLive = state?.state === 'live' && url;
  const canvasHeight = size === 'tall' ? 360 : 280;

  // When the upstream URL changes (start/restart/run-switch), sync the
  // draft input and the actual loaded iframe URL.
  useEffect(() => {
    if (url === null) {
      setDraftUrl('');
      setLoadedUrl(null);
      return;
    }
    setDraftUrl(url);
    setLoadedUrl(url);
  }, [url]);

  // Reset toggle states whenever the iframe is reloaded (key bump) or the
  // run changes — the injected script's state doesn't survive navigation.
  useEffect(() => {
    setDevtoolsOpen(false);
    setInspectOn(false);
  }, [iframeKey, activeRunId]);

  // Listen for selections posted from the inspect.js running inside the
  // iframe. The inspector auto-disables after a click, so flip the local
  // toggle off and hand the payload to the parent.
  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const { source, type, payload } = data as {
        source?: string;
        type?: string;
        payload?: unknown;
      };
      if (source !== 'kb-inspect') return;
      if (type === 'selected' && payload && typeof payload === 'object') {
        setInspectOn(false);
        onInspectSelect?.(payload as PreviewInspectSelection);
      } else if (type === 'cancelled') {
        setInspectOn(false);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onInspectSelect]);

  function postToFrame(source: 'kb-eruda' | 'kb-inspect', type: string): void {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage({ source, type }, '*');
    } catch {
      // ignore — iframe may not be loaded yet.
    }
  }

  function toggleDevtools(): void {
    const next = !devtoolsOpen;
    setDevtoolsOpen(next);
    postToFrame('kb-eruda', next ? 'show' : 'hide');
  }

  function toggleInspect(): void {
    const next = !inspectOn;
    setInspectOn(next);
    postToFrame('kb-inspect', next ? 'enable' : 'disable');
  }

  function submitUrl(): void {
    if (draftUrl.trim() === '') return;
    setLoadedUrl(draftUrl.trim());
    setIframeKey((k) => k + 1);
  }
  function refresh(): void {
    setIframeKey((k) => k + 1);
  }
  async function copyUrl(): Promise<void> {
    if (loadedUrl === null) return;
    try {
      await navigator.clipboard.writeText(loadedUrl);
      setCopyOk(true);
      window.setTimeout(() => setCopyOk(false), 1200);
    } catch {
      // ignore — clipboard may be unavailable in restricted contexts.
    }
  }

  function openExternal(): void {
    // Prefer the upstream dev-server URL so the external browser gets real
    // devtools instead of our in-iframe injection.
    const target = upstreamUrl ?? loadedUrl;
    if (target) window.open(target, '_blank');
  }

  return (
    <div className="kb-preview-frame" role="region" aria-label="Branch preview">
      <div className="pf-bar">
        <div className="pf-dots" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        {activeRunId ? (
          <button
            type="button"
            className="pf-play"
            onClick={() => void (isLive ? stop() : start())}
            disabled={busy || state?.state === 'booting'}
            aria-label={isLive ? 'Pause preview' : 'Resume preview'}
            title={
              busy || state?.state === 'booting'
                ? 'Preview is changing state…'
                : isLive
                  ? 'Pause the dev server'
                  : state?.state === 'crashed'
                    ? 'Retry — the dev server crashed'
                    : 'Resume the dev server'
            }
          >
            <span aria-hidden>{isLive ? '⏸' : '▶'}</span>
          </button>
        ) : null}
        {isLive ? (
          <form
            className="pf-url-form"
            onSubmit={(e) => {
              e.preventDefault();
              submitUrl();
            }}
          >
            <input
              type="url"
              className="pf-url-input"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              spellCheck={false}
              autoCorrect="off"
              aria-label="Preview URL"
              title="Edit and press Enter to navigate"
            />
            <button
              type="button"
              className="pf-url-action"
              onClick={refresh}
              title="Refresh preview"
              aria-label="Refresh preview"
            >
              <span aria-hidden>↻</span>
            </button>
            <button
              type="button"
              className="pf-url-action"
              onClick={() => void copyUrl()}
              title={copyOk ? 'Copied!' : 'Copy URL'}
              aria-label="Copy URL"
            >
              <span aria-hidden>{copyOk ? '✓' : '⧉'}</span>
            </button>
            <button
              type="button"
              className="pf-url-action"
              onClick={openExternal}
              title="Open the raw dev-server URL in a new browser tab"
              aria-label="Open in external browser"
            >
              <span aria-hidden>↗</span>
            </button>
          </form>
        ) : (
          <div className="pf-url">
            {url ?? `(no preview)`} · {branch ?? '(no worktree)'}
          </div>
        )}
        {isLive ? (
          <div className="pf-device" role="group" aria-label="Device preview mode">
            <button
              type="button"
              className={`pf-device-btn${device === 'desktop' ? ' is-active' : ''}`}
              aria-pressed={device === 'desktop'}
              title="Desktop view (full width)"
              onClick={() => setDevice('desktop')}
            >
              Desktop
            </button>
            <button
              type="button"
              className={`pf-device-btn${device === 'mobile' ? ' is-active' : ''}`}
              aria-pressed={device === 'mobile'}
              title={`Mobile view (${MOBILE_W}×${MOBILE_H})`}
              onClick={() => setDevice('mobile')}
            >
              Mobile
            </button>
            <button
              type="button"
              className={`pf-device-btn${device === 'responsive' ? ' is-active' : ''}`}
              aria-pressed={device === 'responsive'}
              title="Responsive view (drag the bottom-right corner to resize)"
              onClick={() => setDevice('responsive')}
            >
              Responsive
            </button>
          </div>
        ) : null}
        {isLive ? (
          <>
            <button
              type="button"
              className={`pf-tool${devtoolsOpen ? ' is-active' : ''}`}
              aria-pressed={devtoolsOpen}
              onClick={toggleDevtools}
              title={devtoolsOpen ? 'Hide devtools panel' : 'Show devtools panel'}
              aria-label="Toggle devtools panel"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
                <path d="M4 6.5l2 1.5-2 1.5" />
                <path d="M8 10h4" />
              </svg>
            </button>
            <button
              type="button"
              className={`pf-tool${inspectOn ? ' is-active' : ''}`}
              aria-pressed={inspectOn}
              onClick={toggleInspect}
              title={
                inspectOn
                  ? 'Cancel inspect — click an element in the preview to capture it'
                  : 'Inspect — click any element in the preview to capture its context'
              }
              aria-label="Toggle inspect mode"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="8" cy="8" r="5" />
                <path d="M8 1.5v3" />
                <path d="M8 11.5v3" />
                <path d="M1.5 8h3" />
                <path d="M11.5 8h3" />
              </svg>
            </button>
          </>
        ) : null}
        <span style={{ color: state?.state === 'live' ? 'var(--review)' : 'var(--ink-3)' }}>
          {state?.state ?? 'idle'}
        </span>
      </div>
      <div
        className={`pf-canvas pf-canvas-${device}`}
        style={{ height: canvasHeight, padding: 0 }}
      >
        {isLive ? (
          device === 'mobile' ? (
            <div className="pf-mobile-shell" aria-label="Mobile device frame">
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={loadedUrl ?? undefined}
                title="Branch preview"
                sandbox="allow-scripts allow-same-origin allow-forms"
                style={{
                  width: MOBILE_W,
                  height: MOBILE_H,
                  border: 'none',
                  background: 'white',
                  display: 'block',
                }}
              />
            </div>
          ) : device === 'responsive' ? (
            <div className="pf-responsive-shell">
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={loadedUrl ?? undefined}
                title="Branch preview"
                sandbox="allow-scripts allow-same-origin allow-forms"
                style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
              />
            </div>
          ) : (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={loadedUrl ?? undefined}
              title="Branch preview"
              sandbox="allow-scripts allow-same-origin allow-forms"
              style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
            />
          )
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 24,
              height: '100%',
            }}
          >
            <div className="lbl" style={{ color: 'var(--ink-2)' }}>
              BRANCH PREVIEW
            </div>
            <div className="lbl" style={{ color: 'var(--ink-3)' }}>
              {worktreePath ? `worktree: ${worktreePath}` : 'no worktree'}
            </div>
            {activeRunId ? (
              <button
                type="button"
                className="kb-btn primary"
                onClick={() => void start()}
                disabled={busy || state?.state === 'booting'}
              >
                {busy
                  ? 'Starting…'
                  : state?.state === 'crashed'
                    ? 'Retry preview'
                    : 'Start preview'}
              </button>
            ) : (
              <div className="lbl" style={{ color: 'var(--ink-4)' }}>
                no active run
              </div>
            )}
            {error ? (
              <div className="kb-composer-error" style={{ marginTop: 8 }}>
                {error}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {isLive ? (
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '8px 10px',
            borderTop: '1px solid var(--hairline-soft)',
            background: 'var(--bg)',
          }}
        >
          <button
            type="button"
            className="kb-btn ghost"
            onClick={() => void stop()}
            disabled={busy}
          >
            Stop preview
          </button>
          <button type="button" className="kb-btn ghost" onClick={openExternal}>
            Open in browser ↗
          </button>
        </div>
      ) : null}
    </div>
  );
}
