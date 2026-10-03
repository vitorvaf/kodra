import { useEffect, useState, type ChangeEvent } from 'react';
import type { BoardView } from '../../hooks/useBoardViews.js';
import Button from '@mui/material/Button';
import { ModalFrame } from './ModalFrame.js';

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
    <ModalFrame
      escapeCloses={false}
      title="Saved views"
      ariaLabel="Manage saved board views"
      width={560}
      onClose={onClose}
      bodyClassName="kb-sentry-body"
      footerHint={'Stored in localStorage, scoped to this workspace.'}
      actions={
        <Button color="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="kb-sentry-hint">
        Saved presets of filters + sort + columns. Drag to reorder; the order surfaces in the
        toolbar dropdown.
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
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setDraftName(e.target.value)}
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
    </ModalFrame>
  );
}
