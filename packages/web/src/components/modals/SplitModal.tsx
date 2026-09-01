import { Logo } from '../Logo.js';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { api } from '../../api.js';
import { useFocusedRepo } from '../../hooks/useFocusedRepo.js';
import { dispatchIssuesRefetch } from '../../hooks/useIssues.js';
import type { Issue } from '../../types.js';

export interface SplitModalProps {
  parentNumber: number;
  parentTitle: string;
  onClose: () => void;
  onSplit?: (children: Issue[]) => void;
}

interface DraftSubtask {
  title: string;
  body: string;
}

export function SplitModal({ parentNumber, parentTitle, onClose, onSplit }: SplitModalProps) {
  const [drafts, setDrafts] = useState<DraftSubtask[]>([
    { title: '', body: '' },
    { title: '', body: '' },
  ]);
  const [dispatchAgents, setDispatchAgents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { focusedRepoId } = useFocusedRepo();

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function setTitle(i: number, value: string): void {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, title: value } : d)));
  }
  function setBody(i: number, value: string): void {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, body: value } : d)));
  }
  function addRow(): void {
    if (drafts.length >= 8) return;
    setDrafts((prev) => [...prev, { title: '', body: '' }]);
  }
  function removeRow(i: number): void {
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  const filled = drafts.filter((d) => d.title.trim().length > 0);
  const canSubmit = filled.length > 0 && !submitting;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.splitIssue(
        parentNumber,
        filled.map((d) => ({
          title: d.title.trim(),
          ...(d.body.trim() ? { body: d.body.trim() } : {}),
        })),
        {
          dispatch: dispatchAgents,
          ...(dispatchAgents && focusedRepoId !== null ? { repoId: focusedRepoId } : {}),
        },
      );
      dispatchIssuesRefetch();
      onSplit?.(result.children);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  function onTitleKey(e: KeyboardEvent<HTMLInputElement>): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="kb-modal-scrim kb-app" onClick={onClose} role="dialog" aria-modal="true">
      <div className="kb-modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="kb-modal-head">
          <Logo size={11} withWordmark />
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span className="num">#{parentNumber}</span>
          <h2>Split into sub-tasks</h2>
          <span className="grow" />
          <button type="button" className="x-btn" onClick={onClose} aria-label="Close">
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

        <div className="kb-modal-body" style={{ display: 'block' }}>
          <div className="kb-tcm-content">
            <div style={{ marginBottom: 14, color: 'var(--ink-2)', fontSize: 12 }}>
              Splitting <span style={{ color: 'var(--ink-1)' }}>#{parentNumber}</span> ·{' '}
              <span style={{ color: 'var(--ink-1)' }}>{parentTitle}</span> into sub-tasks. Each
              becomes a new issue tagged <span className="kb-kbd">parent:{parentNumber}</span>.
            </div>

            <div className="kb-field">
              <label className="kb-field-label">
                Sub-tasks
                <span className="kb-field-hint">{drafts.length} / 8</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {drafts.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid var(--hairline)',
                      borderRadius: 9,
                      background: 'var(--bg-1)',
                      padding: 10,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--ff-mono)',
                          fontSize: 11,
                          color: 'var(--ink-3)',
                        }}
                      >
                        {i + 1}.
                      </span>
                      <input
                        className="kb-input"
                        placeholder="Sub-task title…"
                        value={d.title}
                        onChange={(e) => setTitle(i, e.target.value)}
                        onKeyDown={onTitleKey}
                        style={{ flex: 1, fontSize: 13 }}
                        autoFocus={i === 0}
                      />
                      {drafts.length > 1 ? (
                        <button
                          type="button"
                          className="kb-btn ghost"
                          onClick={() => removeRow(i)}
                          aria-label="Remove sub-task"
                          style={{ height: 24, padding: '0 8px' }}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                    <textarea
                      className="kb-textarea"
                      placeholder="Optional details / acceptance criteria"
                      value={d.body}
                      onChange={(e) => setBody(i, e.target.value)}
                      style={{ minHeight: 60, fontSize: 12 }}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="kb-scope-add"
                onClick={addRow}
                disabled={drafts.length >= 8}
                style={{ marginTop: 8 }}
              >
                + Add sub-task
              </button>
            </div>

            <div className="kb-field" style={{ marginBottom: 0 }}>
              <label className="kb-tweaks-toggle">
                <span>Dispatch agents on each sub-task immediately</span>
                <span className="kb-tweaks-switch" data-on={dispatchAgents ? 'true' : 'false'} />
                <input
                  type="checkbox"
                  checked={dispatchAgents}
                  onChange={(e) => setDispatchAgents(e.target.checked)}
                />
              </label>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                {dispatchAgents
                  ? 'Each sub-task will spin up its own worktree + agent run.'
                  : 'Sub-tasks land in Backlog. Start them manually from the board.'}
              </div>
            </div>
          </div>
        </div>

        <div className="kb-modal-foot">
          <span className="hint">{filled.length} sub-task{filled.length === 1 ? '' : 's'} ready</span>
          {error ? (
            <span style={{ color: 'var(--failed)', fontSize: 11.5 }} role="alert">
              {error}
            </span>
          ) : null}
          <span className="grow" />
          <button type="button" className="kb-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="kb-btn primary"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {submitting ? 'Splitting…' : `Split into ${filled.length || 'N'}`}
            <span className="kb-kbd" style={{ marginLeft: 6 }}>
              ⌘↵
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
