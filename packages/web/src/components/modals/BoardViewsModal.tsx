import { Logo } from '../Logo.js';
import { useEffect, useState, type MouseEvent, type ChangeEvent } from 'react';
import type { BoardView } from '../../hooks/useBoardViews.js';

export interface BoardViewsModalProps {
  views: BoardView[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onClose: () => void;
}

export function BoardViewsModal({
  views,
  onRename,
  onDelete,
  onReorder,
  onClose,
}: BoardViewsModalProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        if (editingId !== null) setEditingId(null);
        else onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editingId]);

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  function commitRename(id: string): void {
    const name = draftName.trim();
    if (name.length > 0) onRename(id, name);
    setEditingId(null);
    setDraftName('');
  }

  function onDrop(targetId: string): void {
    if (dragId === null || dragId === targetId) {
      setDragId(null);
      return;
    }
    const order = views.map((v) => v.id);
    const from = order.indexOf(dragId);
    const to = order.indexOf(targetId);
    if (from === -1 || to === -1) {
      setDragId(null);
      return;
    }
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setDragId(null);
    onReorder(next);
  }

  return (
    <div
      className="kb-modal-scrim kb-app"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Manage saved board views"
    >
      <div className="kb-modal kb-sentry-modal" onClick={stopInner}>
        <div className="kb-modal-head">
          <Logo size={11} withWordmark />
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <h2>Saved views</h2>
          <span className="grow" />
          <button
            type="button"
            className="x-btn"
            onClick={onClose}
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
            Saved presets of filters + sort + columns. Drag to reorder; the
            order surfaces in the toolbar dropdown.
          </div>
          {views.length === 0 ? (
            <div className="kb-sentry-row kb-repos-empty">No saved views yet.</div>
          ) : (
            <div className="kb-board-views-manage">
              {views.map((v) => (
                <div
                  key={v.id}
                  className={`kb-board-views-row${dragId === v.id ? ' is-dragging' : ''}`}
                  draggable={editingId === null}
                  onDragStart={() => setDragId(v.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(v.id)}
                  onDragEnd={() => setDragId(null)}
                >
                  <span className="kb-board-views-row-handle" aria-hidden>
                    ⋮⋮
                  </span>
                  {editingId === v.id ? (
                    <input
                      type="text"
                      className="kb-input"
                      value={draftName}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setDraftName(e.target.value)
                      }
                      onBlur={() => commitRename(v.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename(v.id);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingId(null);
                          setDraftName('');
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className="kb-board-views-row-name"
                      onClick={() => {
                        setDraftName(v.name);
                        setEditingId(v.id);
                      }}
                      title="Rename"
                    >
                      {v.name}
                    </button>
                  )}
                  <span className="grow" />
                  <button
                    type="button"
                    className="kb-btn ghost"
                    onClick={() => onDelete(v.id)}
                    title="Delete view"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="kb-modal-foot">
          <span className="hint">Stored in localStorage, scoped to this workspace.</span>
          <span className="grow" />
          <button type="button" className="kb-btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
