import { Logo } from '../Logo.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import { api } from '../../api.js';
import type { CardTemplatePayload, ProviderId } from '../../types.js';

export interface CardTemplatesSettingsModalProps {
  onClose: () => void;
}

interface Draft {
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
  labels: string;
  defaultProvider: '' | ProviderId;
}

const EMPTY_DRAFT: Draft = {
  name: '',
  titleTemplate: '',
  bodyTemplate: '',
  labels: '',
  defaultProvider: '',
};

const PROVIDER_OPTIONS: ReadonlyArray<{ id: ProviderId; label: string }> = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex-cli', label: 'Codex CLI' },
  { id: 'gemini-cli', label: 'Gemini CLI' },
  { id: 'amp-cli', label: 'Amp' },
  { id: 'cursor-cli', label: 'Cursor Agent' },
  { id: 'copilot-cli', label: 'GitHub Copilot' },
  { id: 'opencode-cli', label: 'OpenCode' },
  { id: 'droid-cli', label: 'Factory Droid' },
  { id: 'ccr-cli', label: 'Claude Code Router' },
  { id: 'qwen-cli', label: 'Qwen Code' },
  { id: 'acp', label: 'ACP' },
];

function templateToDraft(t: CardTemplatePayload): Draft {
  return {
    name: t.name,
    titleTemplate: t.titleTemplate,
    bodyTemplate: t.bodyTemplate ?? '',
    labels: t.labels.join(', '),
    defaultProvider: (t.defaultProvider as Draft['defaultProvider']) ?? '',
  };
}

function parseLabels(raw: string): string[] {
  return raw
    .split(',')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function CardTemplatesSettingsModal({ onClose }: CardTemplatesSettingsModalProps) {
  const [templates, setTemplates] = useState<CardTemplatePayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await api.listCardTemplates();
      setTemplates(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.listCardTemplates();
        if (!cancelled) setTemplates(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        if (editingId !== null) {
          setEditingId(null);
          setDraft(EMPTY_DRAFT);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editingId]);

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  function startNew(): void {
    setEditingId('new');
    setDraft(EMPTY_DRAFT);
  }

  function startEdit(t: CardTemplatePayload): void {
    setEditingId(t.id);
    setDraft(templateToDraft(t));
  }

  function cancelEdit(): void {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  async function handleSave(): Promise<void> {
    if (saving) return;
    if (draft.name.trim().length === 0 || draft.titleTemplate.trim().length === 0) {
      setError(new Error('Name and title are required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const labels = parseLabels(draft.labels);
      const provider = draft.defaultProvider === '' ? null : draft.defaultProvider;
      if (editingId === 'new') {
        await api.createCardTemplate({
          name: draft.name.trim(),
          titleTemplate: draft.titleTemplate,
          bodyTemplate: draft.bodyTemplate.length > 0 ? draft.bodyTemplate : null,
          labels,
          defaultProvider: provider,
        });
      } else if (typeof editingId === 'number') {
        await api.updateCardTemplate({
          id: editingId,
          name: draft.name.trim(),
          titleTemplate: draft.titleTemplate,
          bodyTemplate: draft.bodyTemplate.length > 0 ? draft.bodyTemplate : null,
          labels,
          defaultProvider: provider,
        });
      }
      await refresh();
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number): Promise<void> {
    if (busyId !== null) return;
    const ok = window.confirm('Delete this template?');
    if (!ok) return;
    setBusyId(id);
    setError(null);
    try {
      await api.deleteCardTemplate(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusyId(null);
    }
  }

  // Drag-reorder uses the standard HTML5 DnD API so we don't add a
  // dependency just for this surface. The list is short (typically <20
  // templates) so DOM perf is not a concern.
  async function commitReorder(nextOrder: number[]): Promise<void> {
    setError(null);
    // Optimistic — apply the new order locally first so the row drops
    // visually without waiting for the round-trip.
    setTemplates((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t] as const));
      return nextOrder
        .map((id, i) => {
          const t = byId.get(id);
          return t ? { ...t, sortOrder: i } : null;
        })
        .filter((t): t is CardTemplatePayload => t !== null);
    });
    try {
      await api.reorderCardTemplates(nextOrder);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      await refresh();
    }
  }

  const sorted = useMemo(
    () => [...templates].sort((a, b) => a.sortOrder - b.sortOrder),
    [templates],
  );

  function onDragStart(id: number): void {
    setDragId(id);
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
  }
  async function onDrop(targetId: number): Promise<void> {
    if (dragId === null || dragId === targetId) {
      setDragId(null);
      return;
    }
    const order = sorted.map((t) => t.id);
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
    await commitReorder(next);
  }

  return (
    <div
      className="kb-modal-scrim kb-app"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Card templates"
    >
      <div className="kb-modal kb-sentry-modal" onClick={stopInner}>
        <div className="kb-modal-head">
          <Logo size={11} withWordmark />
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <h2>Card templates</h2>
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
            Saved prompt + label + agent presets. Use them from the &ldquo;From
            template&rdquo; quick-pick at the top of the new-task modal to spawn
            a card with one click. Drag to reorder; the order surfaces in the
            quick-pick.
          </div>

          {loading ? <div className="kb-sentry-row">Loading…</div> : null}
          {error ? (
            <div className="kb-sentry-error" role="alert">
              {error.message}
            </div>
          ) : null}

          {!loading ? (
            <div className="kb-card-templates-list">
              {sorted.length === 0 && editingId === null ? (
                <div className="kb-sentry-row kb-repos-empty">
                  No templates yet. Add the first one below.
                </div>
              ) : null}

              {sorted.map((t) => (
                <div
                  key={t.id}
                  className={`kb-card-template-row${
                    editingId === t.id ? ' is-editing' : ''
                  }${dragId === t.id ? ' is-dragging' : ''}`}
                  draggable={editingId === null}
                  onDragStart={() => onDragStart(t.id)}
                  onDragOver={onDragOver}
                  onDrop={() => void onDrop(t.id)}
                  onDragEnd={() => setDragId(null)}
                >
                  {editingId === t.id ? (
                    <TemplateEditor
                      draft={draft}
                      setDraft={setDraft}
                      saving={saving}
                      onSave={() => void handleSave()}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <TemplateRow
                      template={t}
                      busy={busyId === t.id}
                      onEdit={() => startEdit(t)}
                      onDelete={() => void handleDelete(t.id)}
                    />
                  )}
                </div>
              ))}

              {editingId === 'new' ? (
                <div className="kb-card-template-row is-editing">
                  <TemplateEditor
                    draft={draft}
                    setDraft={setDraft}
                    saving={saving}
                    onSave={() => void handleSave()}
                    onCancel={cancelEdit}
                  />
                </div>
              ) : null}

              {editingId === null ? (
                <button
                  type="button"
                  className="kb-btn ghost kb-repos-add-toggle"
                  onClick={startNew}
                >
                  + New template
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="kb-modal-foot">
          <span className="hint">
            Templates live in the workspace database. <code>{'{{cursor}}'}</code>{' '}
            inside the body marks where the create-task modal places the caret.
          </span>
          <span className="grow" />
          <button type="button" className="kb-btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface TemplateRowProps {
  template: CardTemplatePayload;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function TemplateRow({ template, busy, onEdit, onDelete }: TemplateRowProps) {
  return (
    <div className="kb-card-template-summary">
      <div className="kb-card-template-handle" aria-hidden>
        ⋮⋮
      </div>
      <div className="kb-card-template-summary-text">
        <div className="kb-card-template-name">{template.name}</div>
        <div className="kb-card-template-preview" title={template.titleTemplate}>
          {template.titleTemplate}
        </div>
        <div className="kb-card-template-tags">
          {template.labels.map((l) => (
            <span key={l} className="kb-card-template-tag">
              {l}
            </span>
          ))}
          {template.defaultProvider ? (
            <span className="kb-card-template-provider">
              {template.defaultProvider}
            </span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="kb-btn ghost"
        onClick={onEdit}
        disabled={busy}
      >
        Edit
      </button>
      <button
        type="button"
        className="kb-btn ghost"
        onClick={onDelete}
        disabled={busy}
        title="Delete this template"
      >
        Delete
      </button>
    </div>
  );
}

interface TemplateEditorProps {
  draft: Draft;
  setDraft: (next: Draft) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function TemplateEditor({
  draft,
  setDraft,
  saving,
  onSave,
  onCancel,
}: TemplateEditorProps) {
  function update<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft({ ...draft, [key]: value });
  }

  return (
    <div className="kb-card-template-editor">
      <label className="kb-sentry-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <span className="kb-sentry-label">Name</span>
        <input
          type="text"
          value={draft.name}
          placeholder="Bug triage"
          onChange={(e: ChangeEvent<HTMLInputElement>) => update('name', e.target.value)}
        />
      </label>
      <label className="kb-sentry-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <span className="kb-sentry-label">Title</span>
        <input
          type="text"
          value={draft.titleTemplate}
          placeholder="Bug: "
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            update('titleTemplate', e.target.value)
          }
        />
      </label>
      <label className="kb-sentry-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <span className="kb-sentry-label">
          Body <span className="kb-field-hint">use {`{{cursor}}`} for caret placement</span>
        </span>
        <textarea
          value={draft.bodyTemplate}
          placeholder={`Steps to reproduce:\n1. {{cursor}}\n\nExpected:\n\nActual:`}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            update('bodyTemplate', e.target.value)
          }
          rows={6}
          spellCheck={false}
          style={{
            width: '100%',
            fontFamily: 'var(--ff-mono)',
            fontSize: 12.5,
            padding: 8,
            resize: 'vertical',
          }}
        />
      </label>
      <label className="kb-sentry-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <span className="kb-sentry-label">Labels</span>
        <input
          type="text"
          value={draft.labels}
          placeholder="type:fix, priority:p2"
          onChange={(e: ChangeEvent<HTMLInputElement>) => update('labels', e.target.value)}
        />
      </label>
      <label className="kb-sentry-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <span className="kb-sentry-label">Default provider</span>
        <select
          value={draft.defaultProvider}
          onChange={(e) => update('defaultProvider', e.target.value as Draft['defaultProvider'])}
          className="kb-input"
        >
          <option value="">(none — user picks)</option>
          {PROVIDER_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="kb-card-template-editor-actions">
        <button type="button" className="kb-btn ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="kb-btn primary"
          onClick={onSave}
          disabled={saving || draft.name.trim().length === 0}
        >
          {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  );
}
