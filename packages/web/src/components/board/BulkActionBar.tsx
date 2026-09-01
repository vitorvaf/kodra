import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { STATUS_LABEL } from '../../labels.js';
import type { StatusKey } from '../../types.js';

export type BulkStatusTarget = StatusKey | null;

export interface BulkActionBarProps {
  /** Count of currently-selected cards; the bar mounts only when > 0. */
  count: number;
  busy: boolean;
  /** Move all selected cards to the given board status (null = Inbox). */
  onMoveToStatus: (status: BulkStatusTarget) => void;
  /** Append the given labels to all selected cards. */
  onAddLabels: (labels: string[]) => void;
  /** Dispatch agents on every selected card that's currently idle. */
  onDispatch: () => void;
  /** Archive every selected card. */
  onArchive: () => void;
  /** Clear the selection. */
  onClear: () => void;
}

const STATUS_TARGETS: ReadonlyArray<{ key: BulkStatusTarget; label: string }> = [
  { key: null, label: 'Inbox' },
  { key: 'backlog', label: STATUS_LABEL.backlog },
  { key: 'todo', label: STATUS_LABEL.todo },
  { key: 'inProgress', label: STATUS_LABEL.inProgress },
  { key: 'review', label: STATUS_LABEL.review },
  { key: 'done', label: STATUS_LABEL.done },
];

/**
 * Floating action bar that appears at the bottom of the board when one
 * or more cards are multi-selected. Mirrors the kb-btn / kb-pill
 * patterns used by the rest of the surface — no new dependencies.
 */
export function BulkActionBar({
  count,
  busy,
  onMoveToStatus,
  onAddLabels,
  onDispatch,
  onArchive,
  onClear,
}: BulkActionBarProps) {
  return (
    <div
      className="kb-bulk-action-bar"
      role="region"
      aria-label={`Bulk actions for ${count} selected card${count === 1 ? '' : 's'}`}
    >
      <span className="kb-bulk-count">
        {count} card{count === 1 ? '' : 's'} selected
      </span>
      <span className="kb-bulk-spacer" />
      <StatusDropdown busy={busy} onPick={onMoveToStatus} />
      <LabelsDropdown busy={busy} onApply={onAddLabels} />
      <button
        type="button"
        className="kb-btn"
        onClick={onDispatch}
        disabled={busy}
        title="Start an agent run on each idle selected card"
      >
        Dispatch
      </button>
      <button
        type="button"
        className="kb-btn ghost"
        onClick={onArchive}
        disabled={busy}
        title="Archive every selected card"
      >
        Archive
      </button>
      <button
        type="button"
        className="kb-btn ghost"
        onClick={onClear}
        disabled={busy}
        title="Clear the selection"
      >
        Clear
      </button>
    </div>
  );
}

function StatusDropdown({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (s: BulkStatusTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: globalThis.MouseEvent): void {
      const target = e.target as Node | null;
      if (target && wrapRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function handlePick(e: MouseEvent<HTMLButtonElement>, s: BulkStatusTarget): void {
    e.stopPropagation();
    setOpen(false);
    onPick(s);
  }

  return (
    <div className="kb-bulk-drop" ref={wrapRef}>
      <button
        type="button"
        className="kb-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="Move every selected card to a status column"
      >
        Move to <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="kb-bulk-drop-menu" role="menu">
          {STATUS_TARGETS.map((t) => (
            <button
              key={String(t.key)}
              type="button"
              role="menuitem"
              className="kb-bulk-drop-item"
              onClick={(e) => handlePick(e, t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LabelsDropdown({
  busy,
  onApply,
}: {
  busy: boolean;
  onApply: (labels: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: globalThis.MouseEvent): void {
      const target = e.target as Node | null;
      if (target && wrapRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function apply(e: MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();
    const labels = draft
      .split(',')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (labels.length === 0) return;
    onApply(labels);
    setDraft('');
    setOpen(false);
  }

  return (
    <div className="kb-bulk-drop" ref={wrapRef}>
      <button
        type="button"
        className="kb-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="Append labels to every selected card"
      >
        Add labels <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="kb-bulk-drop-menu kb-bulk-drop-menu-labels" role="dialog">
          <label className="kb-bulk-drop-label">Comma-separated</label>
          <input
            type="text"
            className="kb-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="area:auth, priority:p1"
            spellCheck={false}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply(e as unknown as MouseEvent<HTMLButtonElement>);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
              }
            }}
          />
          <div className="kb-bulk-drop-actions">
            <button
              type="button"
              className="kb-btn ghost"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="kb-btn primary"
              onClick={apply}
              disabled={draft.trim().length === 0}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
