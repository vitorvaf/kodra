import { Logo } from '../Logo.js';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { createPersona, deletePersona, listPersonas, type Persona } from '../../personas.js';
import type { ProviderId } from '../../types.js';

export interface PersonaPickerModalProps {
  onClose: () => void;
  onPick: (persona: Persona, provider?: ProviderId, userNotes?: string) => void;
  /** If true, the user can pick multiple personas before confirming. */
  multiSelect?: boolean;
  /** Confirm button label override in multi-select mode. */
  multiSelectConfirmLabel?: string;
  /** Called with the selected personas when the user confirms in multi-select mode. */
  onConfirm?: (personas: Persona[], provider?: ProviderId, userNotes?: string) => void;
  /** Headline shown next to the kanbots crumb. */
  title?: string;
  /** Subhead shown above the persona grid. */
  subtitle?: string;
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  'claude-code': 'Claude',
  'codex-cli': 'Codex',
  'gemini-cli': 'Gemini',
  'amp-cli': 'Amp',
  'cursor-cli': 'Cursor',
  'copilot-cli': 'Copilot',
  'opencode-cli': 'OpenCode',
  'droid-cli': 'Droid',
  'ccr-cli': 'CCR',
  'qwen-cli': 'Qwen',
  acp: 'ACP',
};

const ALL_PROVIDERS: readonly ProviderId[] = [
  'claude-code',
  'codex-cli',
  'gemini-cli',
  'amp-cli',
  'cursor-cli',
  'copilot-cli',
  'opencode-cli',
  'droid-cli',
  'ccr-cli',
  'qwen-cli',
  'acp',
];

export function PersonaPickerModal({
  onClose,
  onPick,
  multiSelect = false,
  multiSelectConfirmLabel,
  onConfirm,
  title,
  subtitle,
}: PersonaPickerModalProps) {
  const [personas, setPersonas] = useState<Persona[]>(() => listPersonas());
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftEmoji, setDraftEmoji] = useState('');
  const [draftTagline, setDraftTagline] = useState('');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [configuredProviders, setConfiguredProviders] = useState<Set<ProviderId>>(
    () => new Set(),
  );
  const [provider, setProvider] = useState<ProviderId>('claude-code');
  const [userNotes, setUserNotes] = useState('');

  const selectedPersonas = useMemo(
    () => personas.filter((p) => selectedIds.has(p.id)),
    [personas, selectedIds],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await api.getProviders();
        if (cancelled) return;
        const configured = payload.providers
          .filter((p) => p.enabled && p.hasKey)
          .map((p) => p.id);
        setConfiguredProviders(new Set(configured));
        if (configured.length > 0) {
          const preferred =
            payload.settings.defaultProvider &&
            configured.includes(payload.settings.defaultProvider)
              ? payload.settings.defaultProvider
              : (configured[0] as ProviderId);
          setProvider(preferred);
        }
      } catch {
        // best-effort: if providers fail to load, fall back to the default
        // (claude-code). The IPC call will surface a clear error if it
        // turns out nothing is configured.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const noProvidersConfigured = configuredProviders.size === 0;
  const trimmedNotes = userNotes.trim();
  const notesArg = trimmedNotes.length > 0 ? trimmedNotes : undefined;

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function reload(): void {
    setPersonas(listPersonas());
  }

  function resetDraft(): void {
    setDraftName('');
    setDraftEmoji('');
    setDraftTagline('');
    setDraftPrompt('');
    setError(null);
  }

  function saveDraft(): void {
    const name = draftName.trim();
    const tagline = draftTagline.trim();
    const prompt = draftPrompt.trim();
    if (name.length === 0) {
      setError('Name is required.');
      return;
    }
    if (prompt.length < 20) {
      setError('Prompt should be at least 20 characters — describe the perspective in a sentence or two.');
      return;
    }
    const emoji = draftEmoji.trim();
    const created = createPersona({
      name,
      tagline,
      prompt,
      ...(emoji ? { emoji } : {}),
    });
    reload();
    resetDraft();
    setCreating(false);
    if (multiSelect) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(created.id);
        return next;
      });
    } else {
      onPick(created, provider, notesArg);
    }
  }

  function handleCardClick(persona: Persona): void {
    if (!multiSelect) {
      onPick(persona, provider, notesArg);
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(persona.id)) {
        next.delete(persona.id);
      } else {
        next.add(persona.id);
      }
      return next;
    });
  }

  function handleConfirm(): void {
    if (!multiSelect || selectedPersonas.length === 0) return;
    if (onConfirm) {
      onConfirm(selectedPersonas, provider, notesArg);
    } else {
      // Backwards-compat fallback: emit each pick individually.
      for (const p of selectedPersonas) onPick(p, provider, notesArg);
    }
  }

  function removeCustom(id: string): void {
    deletePersona(id);
    reload();
  }

  return (
    <div className="kb-modal-scrim kb-app" onClick={onClose} role="dialog" aria-modal="true">
      <div className="kb-modal sm" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="kb-modal-head">
          <Logo size={11} withWordmark />
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <h2>{title ?? 'Pick a perspective'}</h2>
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

        <div className="kb-modal-body" style={{ display: 'block', overflowY: 'auto' }}>
          <div style={{ padding: '18px 22px' }}>
            <div style={{ marginBottom: 16, color: 'var(--ink-2)', fontSize: 12.5 }}>
              {subtitle ??
                'The selected agent will look at your repo and the backlog through the lens you pick. Feature suggestions shift accordingly.'}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
                fontSize: 12.5,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: 'var(--ink-2)' }}>Run with:</span>
              <div role="radiogroup" aria-label="Suggestion agent" style={{ display: 'flex', gap: 6 }}>
                {ALL_PROVIDERS.map((id) => {
                  const isConfigured = configuredProviders.has(id);
                  const isSelected = provider === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={!isConfigured}
                      className={`kb-btn ${isSelected ? 'primary' : 'ghost'}`}
                      onClick={() => {
                        if (isConfigured) setProvider(id);
                      }}
                      title={isConfigured ? PROVIDER_LABELS[id] : `${PROVIDER_LABELS[id]} — not configured. Add an API key in Settings.`}
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        opacity: isConfigured ? 1 : 0.5,
                        cursor: isConfigured ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {PROVIDER_LABELS[id]}
                    </button>
                  );
                })}
              </div>
              {noProvidersConfigured ? (
                <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
                  No providers configured — set one up in Settings.
                </span>
              ) : null}
            </div>

            <div className="kb-field" style={{ marginBottom: 16 }}>
              <label className="kb-field-label" htmlFor="kb-suggest-notes">
                Notes (optional) — narrow the suggestion to a topic, area, or constraint
              </label>
              <textarea
                id="kb-suggest-notes"
                className="kb-textarea"
                placeholder="e.g. focus on the onboarding flow, only API/server-side changes, must be doable in a single PR…"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                rows={3}
                maxLength={4000}
                style={{ fontSize: 12.5 }}
              />
            </div>

            <div className="kb-persona-grid">
              {personas.map((p) => {
                const isSelected = multiSelect && selectedIds.has(p.id);
                return (
                <button
                  key={p.id}
                  type="button"
                  className={`kb-persona-card${isSelected ? ' selected' : ''}`}
                  onClick={() => handleCardClick(p)}
                  title={p.prompt}
                  aria-pressed={multiSelect ? isSelected : undefined}
                >
                  <div className="kb-persona-emoji" aria-hidden>
                    {p.emoji}
                  </div>
                  <div className="kb-persona-name">{p.name}</div>
                  <div className="kb-persona-tagline">{p.tagline}</div>
                  {multiSelect && isSelected ? (
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 10,
                        fontSize: 11,
                        color: 'var(--accent)',
                      }}
                      aria-hidden
                    >
                      ✓
                    </span>
                  ) : null}
                  {!p.builtIn ? (
                    <span
                      className="kb-persona-del"
                      role="button"
                      aria-label={`Delete ${p.name}`}
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCustom(p.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          e.preventDefault();
                          removeCustom(p.id);
                        }
                      }}
                    >
                      ×
                    </span>
                  ) : null}
                </button>
                );
              })}

              {!creating ? (
                <button
                  type="button"
                  className="kb-persona-card kb-persona-card-add"
                  onClick={() => {
                    setCreating(true);
                    setError(null);
                  }}
                >
                  <div className="kb-persona-emoji" aria-hidden>
                    +
                  </div>
                  <div className="kb-persona-name">New persona</div>
                  <div className="kb-persona-tagline">Define your own perspective</div>
                </button>
              ) : null}
            </div>

            {creating ? (
              <div className="kb-persona-create">
                <div className="kb-persona-create-row">
                  <div style={{ flex: '0 0 64px' }}>
                    <label className="kb-field-label">Emoji</label>
                    <input
                      className="kb-input"
                      placeholder="✨"
                      maxLength={4}
                      value={draftEmoji}
                      onChange={(e) => setDraftEmoji(e.target.value)}
                      style={{ textAlign: 'center', fontSize: 16 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="kb-field-label">Name</label>
                    <input
                      className="kb-input"
                      placeholder="e.g. Indie hacker"
                      maxLength={60}
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="kb-field" style={{ marginTop: 10 }}>
                  <label className="kb-field-label">Tagline</label>
                  <input
                    className="kb-input"
                    placeholder="One short line — what they care about"
                    maxLength={80}
                    value={draftTagline}
                    onChange={(e) => setDraftTagline(e.target.value)}
                  />
                </div>

                <div className="kb-field" style={{ marginTop: 10 }}>
                  <label className="kb-field-label">Prompt</label>
                  <textarea
                    className="kb-textarea"
                    placeholder='"You are a ____ who prioritizes ____. You think in terms of ____. You frame proposals around ____."'
                    value={draftPrompt}
                    onChange={(e) => setDraftPrompt(e.target.value)}
                    rows={5}
                    style={{ fontSize: 12.5 }}
                  />
                  <div className="kb-field-hint" style={{ marginTop: 4 }}>
                    Becomes the system-prompt prefix when Claude generates a suggestion.
                  </div>
                </div>

                {error ? (
                  <div className="composer-error" role="alert" style={{ marginTop: 8 }}>
                    {error}
                  </div>
                ) : null}

                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="kb-btn ghost"
                    onClick={() => {
                      setCreating(false);
                      resetDraft();
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className="kb-btn primary" onClick={saveDraft}>
                    Save and use
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="kb-modal-foot">
          <span className="hint">
            Custom personas are stored locally on this machine.
          </span>
          <span className="grow" />
          <button type="button" className="kb-btn ghost" onClick={onClose}>
            Cancel
          </button>
          {multiSelect ? (
            <button
              type="button"
              className="kb-btn primary"
              disabled={selectedPersonas.length === 0}
              onClick={handleConfirm}
              style={{ marginLeft: 8 }}
            >
              {multiSelectConfirmLabel ??
                `Use ${selectedPersonas.length} persona${selectedPersonas.length === 1 ? '' : 's'}`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
