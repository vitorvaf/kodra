import { useEffect, useMemo, useRef, useState } from 'react';
import { ageString } from '../../labels.js';
import { ModelPicker, type ModelPickerValue } from '../forms/ModelPicker.js';
import type {
  ChatSessionPayload,
  ChatSessionStatus,
  ProviderId,
} from '../../types.js';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  'claude-code': 'Claude Code',
  'codex-cli': 'Codex CLI',
  'gemini-cli': 'Gemini CLI',
  'amp-cli': 'Amp',
  'cursor-cli': 'Cursor Agent',
  'copilot-cli': 'GitHub Copilot',
  'opencode-cli': 'OpenCode',
  'droid-cli': 'Factory Droid',
  'ccr-cli': 'Claude Code Router',
  'qwen-cli': 'Qwen Code',
  acp: 'ACP',
};

const STATUS_DOT_CLASS: Record<ChatSessionStatus, string> = {
  idle: 'idle',
  running: 'running',
  awaiting_input: 'awaiting',
  completed: 'completed',
  failed: 'failed',
};

function sessionLabel(session: ChatSessionPayload): string {
  if (session.title && session.title.trim().length > 0) return session.title;
  return 'Latest';
}

export interface SessionCreateInput {
  provider: ProviderId;
  model: string | null;
  title: string | null;
}

export interface SessionDropdownProps {
  sessions: ChatSessionPayload[];
  activeSessionId: number | null;
  onActiveSessionChange: (sessionId: number) => void;
  onCreateSession: (input: SessionCreateInput) => Promise<ChatSessionPayload>;
  onRenameSession: (
    id: number,
    title: string | null,
  ) => Promise<ChatSessionPayload>;
  onDeleteSession: (id: number) => Promise<void>;
  onSessionsChange: (next: ChatSessionPayload[]) => void;
}

/**
 * Compact dropdown for picking which session a chat composer posts into.
 * Sits above the input row and matches the existing chat-foot rhythm —
 * pill trigger + click-to-open menu + nested popover for "+ New Session".
 * The renderer owns the active-session id (persisted to localStorage by
 * the consumer); this component is a controlled view over it.
 *
 * The CRUD operations are passed in as callbacks so the same dropdown
 * can drive both the standalone chat surface (conversation-scoped
 * sessions) and the TaskDetailModal reply footer (thread-scoped
 * sessions) without leaking the scope discriminator into the UI layer.
 */
export function SessionDropdown({
  sessions,
  activeSessionId,
  onActiveSessionChange,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onSessionsChange,
}: SessionDropdownProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape — mirrors how the account menu and
  // tray dropdowns dismiss themselves elsewhere in the renderer.
  useEffect(() => {
    if (!menuOpen && !creatorOpen) return;
    function onPointerDown(e: PointerEvent): void {
      const root = containerRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setMenuOpen(false);
      setCreatorOpen(false);
      setRenameId(null);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setCreatorOpen(false);
        setRenameId(null);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, creatorOpen]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null,
    [sessions, activeSessionId],
  );

  async function handleCreate(input: SessionCreateInput): Promise<void> {
    const created = await onCreateSession(input);
    onSessionsChange([created, ...sessions]);
    onActiveSessionChange(created.id);
    setCreatorOpen(false);
    setMenuOpen(false);
  }

  async function handleRename(id: number, title: string | null): Promise<void> {
    const updated = await onRenameSession(id, title);
    onSessionsChange(sessions.map((s) => (s.id === id ? updated : s)));
    setRenameId(null);
  }

  async function handleDelete(id: number): Promise<void> {
    await onDeleteSession(id);
    const remaining = sessions.filter((s) => s.id !== id);
    onSessionsChange(remaining);
    // If we just removed the active session, fall back to the next most
    // recent so the composer never points at a tombstone.
    if (id === activeSessionId && remaining[0]) {
      onActiveSessionChange(remaining[0].id);
    }
  }

  const triggerLabel = activeSession ? sessionLabel(activeSession) : 'Session';
  const triggerStatus = activeSession?.status ?? 'idle';

  return (
    <div className="kb-chat-session-dd" ref={containerRef}>
      <button
        type="button"
        className="kb-chat-session-trigger"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <span
          className={`kb-chat-session-dot kb-chat-session-dot-${STATUS_DOT_CLASS[triggerStatus]}`}
          aria-hidden
        />
        <span className="kb-chat-session-trigger-label">{triggerLabel}</span>
        {activeSession ? (
          <span className="kb-chat-session-trigger-agent">
            {PROVIDER_LABELS[activeSession.agentProvider]}
          </span>
        ) : null}
        <span className={`kb-chat-session-chev${menuOpen ? ' open' : ''}`} aria-hidden>
          ›
        </span>
      </button>

      {menuOpen ? (
        <div
          className="kb-chat-session-menu"
          role="menu"
          aria-label="Chat sessions"
        >
          <div className="kb-chat-session-menu-head">
            <span className="kb-chat-session-menu-title">Sessions</span>
            <button
              type="button"
              className="kb-chat-session-new"
              onClick={() => setCreatorOpen(true)}
              title="Start a new session in this chat"
            >
              + New
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="kb-chat-session-empty">No sessions yet.</div>
          ) : (
            <ul className="kb-chat-session-list">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className={`kb-chat-session-row${
                    s.id === activeSession?.id ? ' is-active' : ''
                  }`}
                >
                  {renameId === s.id ? (
                    <SessionRenameInput
                      initial={s.title ?? ''}
                      onCommit={(v) => void handleRename(s.id, v.length > 0 ? v : null)}
                      onCancel={() => setRenameId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="kb-chat-session-row-main"
                      onClick={() => {
                        onActiveSessionChange(s.id);
                        setMenuOpen(false);
                      }}
                      role="menuitemradio"
                      aria-checked={s.id === activeSession?.id}
                    >
                      <span
                        className={`kb-chat-session-dot kb-chat-session-dot-${STATUS_DOT_CLASS[s.status]}`}
                        aria-hidden
                      />
                      <span className="kb-chat-session-row-name">{sessionLabel(s)}</span>
                      <span className="kb-chat-session-row-agent">
                        {PROVIDER_LABELS[s.agentProvider]}
                      </span>
                      <span className="kb-chat-session-row-time">
                        {ageString(s.lastMessageAt ?? s.createdAt)} ago
                      </span>
                    </button>
                  )}
                  {renameId !== s.id ? (
                    <div className="kb-chat-session-row-actions">
                      <button
                        type="button"
                        className="kb-chat-session-row-act"
                        title="Rename session"
                        onClick={() => setRenameId(s.id)}
                      >
                        Rename
                      </button>
                      {sessions.length > 1 ? (
                        <button
                          type="button"
                          className="kb-chat-session-row-act danger"
                          title="Delete session"
                          onClick={() => void handleDelete(s.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {creatorOpen ? (
        <SessionCreatorPopover
          onCreate={(input) => void handleCreate(input)}
          onCancel={() => setCreatorOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SessionRenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);
  return (
    <input
      ref={inputRef}
      className="kb-chat-session-rename"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit(draft.trim());
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      maxLength={200}
    />
  );
}

function SessionCreatorPopover({
  onCreate,
  onCancel,
}: {
  onCreate: (input: SessionCreateInput) => void;
  onCancel: () => void;
}) {
  const [pick, setPick] = useState<ModelPickerValue | null>(null);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function submit(): void {
    if (!pick || submitting) return;
    setSubmitting(true);
    onCreate({
      provider: pick.provider,
      model: pick.model,
      title: title.trim().length > 0 ? title.trim() : null,
    });
  }

  return (
    <div className="kb-chat-session-creator" role="dialog" aria-label="New chat session">
      <div className="kb-chat-session-creator-head">
        <span className="kb-chat-session-creator-title">New session</span>
        <button
          type="button"
          className="kb-chat-session-creator-close"
          onClick={onCancel}
          aria-label="Cancel"
        >
          ×
        </button>
      </div>
      <label className="kb-chat-session-creator-field">
        <span className="kb-chat-session-creator-label">Agent</span>
        <ModelPicker value={pick} onChange={setPick} agentRunsOnly />
      </label>
      <label className="kb-chat-session-creator-field">
        <span className="kb-chat-session-creator-label">Title (optional)</span>
        <input
          type="text"
          className="kb-chat-session-creator-input"
          placeholder="e.g. Exploring · Building · QA"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
      </label>
      <div className="kb-chat-session-creator-foot">
        <button
          type="button"
          className="kb-btn ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="kb-btn primary"
          onClick={submit}
          disabled={!pick || submitting}
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  );
}

/**
 * Convenience hook for renderer surfaces that own an `activeSessionId`
 * state and want it persisted across modal close/reopen. The storage
 * key is supplied verbatim so callers can scope persistence to their
 * own surface (e.g. `kanbots.chat.<conversationId>` for the standalone
 * chat or `kanbots.issue.<threadId>` for the TaskDetailModal).
 */
export function useActiveSessionId(
  storageKey: string,
  fallback: number | null,
): [number | null, (next: number) => void] {
  const [active, setActive] = useState<number | null>(() => {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  });
  function update(next: number): void {
    setActive(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // localStorage can throw in private modes — best-effort persistence
      }
    }
  }
  return [active, update];
}
