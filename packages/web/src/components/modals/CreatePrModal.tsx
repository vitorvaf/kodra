import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import { Logo } from '../Logo.js';
import { api } from '../../api.js';
import { MarkdownEditor } from '../forms/MarkdownEditor.js';

export interface CreatePrModalProps {
  /** Agent run whose worktree/branch we're promoting. */
  runId: number;
  /** Called after the PR has opened successfully. The argument is the URL
   *  the GitHub draft PR ended up at. */
  onCreated: (prUrl: string) => void;
  onClose: () => void;
}

interface DraftState {
  title: string;
  body: string;
  diffTruncated: boolean;
}

/**
 * Two-stage flow:
 *
 *   1. Mount-time: call `api.draftPrDescription(runId)`, render a spinner.
 *   2. When the draft arrives: pre-fill an editable title + body, then on
 *      submit hand them to `api.promotePR(runId, {title, body})`. The
 *      backend honors overrides — neither field is sent if blank.
 *
 * The user can edit either field; nothing about the draft is binding.
 * Cancel from the spinner stage bails out before any LLM call completes
 * server-side (the channel is fire-and-forget on cancel — we just stop
 * caring about the response).
 */
export function CreatePrModal({ runId, onCreated, onClose }: CreatePrModalProps) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [drafting, setDrafting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.draftPrDescription(runId);
        if (cancelled) return;
        setDraft({
          title: res.title,
          body: res.body,
          diffTruncated: res.diffTruncated,
        });
      } catch (err) {
        if (cancelled) return;
        // Fall back to empty fields — the user can still create a PR by
        // typing them in. We surface the error so they know why the
        // pre-fill didn't happen.
        setDraft({ title: '', body: '', diffTruncated: false });
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setDrafting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // Focus the title input the moment the draft arrives so the user can
  // start editing immediately. requestAnimationFrame guards against the
  // ref being null between renders.
  useEffect(() => {
    if (drafting) return;
    const id = requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [drafting]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  function updateField<K extends keyof DraftState>(
    key: K,
    value: DraftState[K],
  ): void {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSubmit(): Promise<void> {
    if (!draft || submitting) return;
    const trimmedTitle = draft.title.trim();
    const trimmedBody = draft.body.trim();
    if (trimmedTitle.length === 0) {
      setError('title is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const opts: { title?: string; body?: string } = { title: trimmedTitle };
      if (trimmedBody.length > 0) opts.body = trimmedBody;
      const result = await api.promotePR(runId, opts);
      onCreated(result.pr.htmlUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="kb-modal-scrim kb-app"
      onClick={() => {
        if (!submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Create draft pull request"
    >
      <div className="kb-modal kb-sentry-modal" onClick={stopInner}>
        <div className="kb-modal-head">
          <Logo size={11} withWordmark />
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <h2>Create draft PR</h2>
          <span className="grow" />
          <button
            type="button"
            className="x-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close (Esc)"
            title="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="kb-modal-body kb-sentry-body">
          <div className="kb-sentry-hint">
            We drafted a title and body from this run's diff to save you a
            round-trip. Edit before submitting — your text is what lands on
            GitHub.
          </div>

          {drafting ? (
            <div
              className="kb-sentry-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '20px 4px',
              }}
            >
              <SpinnerDot />
              <span style={{ color: 'var(--ink-2)' }}>
                Drafting PR description…
              </span>
            </div>
          ) : null}

          {!drafting && draft ? (
            <>
              <label
                className="kb-sentry-row"
                style={{ flexDirection: 'column', alignItems: 'stretch' }}
              >
                <span className="kb-sentry-label" style={{ marginBottom: 6 }}>
                  Title
                </span>
                <input
                  ref={titleRef}
                  className="kb-input"
                  type="text"
                  value={draft.title}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateField('title', e.target.value)
                  }
                  disabled={submitting}
                  placeholder="One-line summary"
                  maxLength={200}
                />
              </label>

              <div
                className="kb-sentry-row"
                style={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  marginTop: 12,
                }}
              >
                <span className="kb-sentry-label" style={{ marginBottom: 6 }}>
                  Body
                </span>
                <MarkdownEditor
                  value={draft.body}
                  onChange={(next) => updateField('body', next)}
                  disabled={submitting}
                  rows={12}
                  ariaLabel="Pull request body"
                  placeholder="Markdown body (Summary / Changes / Why / Test plan)"
                />
              </div>

              {draft.diffTruncated ? (
                <div
                  className="kb-sentry-hint"
                  style={{ marginTop: 6, color: 'var(--ink-3)' }}
                >
                  Heads up: the diff was truncated before drafting — the
                  body may miss work from later files. Edit before submitting.
                </div>
              ) : null}
            </>
          ) : null}

          {error ? (
            <div
              className="kb-sentry-error"
              role="alert"
              style={{ marginTop: 12 }}
            >
              {error}
            </div>
          ) : null}
        </div>

        <div className="kb-modal-foot">
          <span className="hint">
            Pre-filling costs about $0.01-0.05 of agent budget per draft.
          </span>
          <span className="grow" />
          <button
            type="button"
            className="kb-btn ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="kb-btn primary"
            onClick={() => void handleSubmit()}
            disabled={
              drafting || submitting || (draft?.title.trim().length ?? 0) === 0
            }
          >
            {submitting ? 'Opening…' : 'Create draft PR'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SpinnerDot() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="var(--accent)"
        strokeDasharray="45"
        strokeDashoffset="20"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
