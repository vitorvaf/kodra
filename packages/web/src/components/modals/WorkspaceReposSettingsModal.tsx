import { Logo } from '../Logo.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { api, getCloudCtx } from '../../api.js';
import { getBridge } from '../../desktop-bridge.js';
import { dispatchWorkspaceReposChanged } from '../../hooks/useFocusedRepo.js';
import type { WorkspaceRepoPayload } from '../../types.js';

export interface WorkspaceReposSettingsModalProps {
  onClose: () => void;
}

interface AddDraft {
  path: string;
  displayName: string;
  targetBranch: string;
}

const EMPTY_ADD_DRAFT: AddDraft = {
  path: '',
  displayName: '',
  targetBranch: '',
};

export function WorkspaceReposSettingsModal({
  onClose,
}: WorkspaceReposSettingsModalProps) {
  const inCloudMode = getCloudCtx() !== null;
  const [repos, setRepos] = useState<WorkspaceRepoPayload[]>([]);
  const [loading, setLoading] = useState(!inCloudMode);
  const [error, setError] = useState<Error | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<AddDraft>(EMPTY_ADD_DRAFT);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (inCloudMode) return;
    try {
      const list = await api.listWorkspaceRepos();
      setRepos(list);
      // Notify other surfaces (rail switcher, dispatch caption) that the
      // repo list may have changed so they refetch their own copy.
      dispatchWorkspaceReposChanged();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [inCloudMode]);

  useEffect(() => {
    if (inCloudMode) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.listWorkspaceRepos();
        if (cancelled) return;
        setRepos(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inCloudMode]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  async function handlePickFolder(): Promise<void> {
    const bridge = getBridge();
    if (!bridge) {
      setAddError(
        'Desktop bridge not available — open the desktop app instead.',
      );
      return;
    }
    setAddError(null);
    const path = await bridge.pickFolder();
    if (!path) return;
    setAddDraft((d) => ({ ...d, path }));
    if (!addOpen) setAddOpen(true);
  }

  async function handleAddSubmit(e?: FormEvent): Promise<void> {
    if (e) e.preventDefault();
    if (adding) return;
    const path = addDraft.path.trim();
    if (path === '') {
      setAddError('Pick a folder first.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const trimmedName = addDraft.displayName.trim();
      const trimmedBranch = addDraft.targetBranch.trim();
      await api.addWorkspaceRepo({
        repoPath: path,
        ...(trimmedName.length > 0 ? { displayName: trimmedName } : {}),
        ...(trimmedBranch.length > 0 ? { targetBranch: trimmedBranch } : {}),
      });
      await refresh();
      setAddDraft(EMPTY_ADD_DRAFT);
      setAddOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAddError(message);
    } finally {
      setAdding(false);
    }
  }

  async function handleSetPrimary(id: number): Promise<void> {
    if (busyId !== null) return;
    setBusyId(id);
    setError(null);
    try {
      const list = await api.setWorkspaceRepoPrimary(id);
      setRepos(list);
      dispatchWorkspaceReposChanged();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(repo: WorkspaceRepoPayload): Promise<void> {
    if (removingId !== null) return;
    if (repo.isPrimary) {
      const ok = window.confirm(
        'This is the primary repo for the workspace. Removing it may cause ' +
          'unexpected behavior for runs that fall back to the primary. Remove anyway?',
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        `Remove "${repo.displayName ?? repo.repoPath}" from this workspace?`,
      );
      if (!ok) return;
    }
    setRemovingId(repo.id);
    setError(null);
    try {
      await api.removeWorkspaceRepo(repo.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setRemovingId(null);
    }
  }

  async function handleRenameRepo(
    repo: WorkspaceRepoPayload,
    next: string,
  ): Promise<void> {
    const trimmed = next.trim();
    const current = (repo.displayName ?? '').trim();
    if (trimmed === current) return;
    setBusyId(repo.id);
    setError(null);
    try {
      const updated = await api.setWorkspaceRepoDisplayName(
        repo.id,
        trimmed.length === 0 ? null : trimmed,
      );
      setRepos((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      dispatchWorkspaceReposChanged();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetargetBranch(
    repo: WorkspaceRepoPayload,
    next: string,
  ): Promise<void> {
    const trimmed = next.trim();
    const current = (repo.targetBranch ?? '').trim();
    if (trimmed === current) return;
    setBusyId(repo.id);
    setError(null);
    try {
      const updated = await api.setWorkspaceRepoTargetBranch(
        repo.id,
        trimmed.length === 0 ? null : trimmed,
      );
      setRepos((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      dispatchWorkspaceReposChanged();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusyId(null);
    }
  }

  // Sort: primary first, then by addedAt ascending so the list keeps a
  // stable order across renames / branch edits.
  const sorted = useMemo(() => {
    const list = [...repos];
    list.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.addedAt.localeCompare(b.addedAt);
    });
    return list;
  }, [repos]);

  return (
    <div
      className="kb-modal-scrim kb-app"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Workspace repos"
    >
      <div className="kb-modal kb-sentry-modal kb-repos-modal" onClick={stopInner}>
        <div className="kb-modal-head">
          <Logo size={11} withWordmark />
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <h2>Repos</h2>
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

        <div className="kb-modal-body kb-sentry-body kb-repos-body">
          <div className="kb-sentry-hint">
            Local repos mounted into this workspace. Agent runs target the
            primary repo by default; add more so the same board can dispatch
            runs across sibling checkouts (e.g. monorepos split into separate
            git folders, paired client+server repos).
          </div>

          {inCloudMode ? (
            <div className="kb-sentry-warn" role="status">
              Multi-repo workspaces are a local feature; cloud projects use the
              binding configured in Cloud Settings.
            </div>
          ) : null}

          {loading ? <div className="kb-sentry-row">Loading…</div> : null}

          {error ? (
            <div className="kb-sentry-error" role="alert">
              {error.message}
            </div>
          ) : null}

          {!inCloudMode && !loading ? (
            <>
              {sorted.length === 0 ? (
                <div className="kb-sentry-row kb-repos-empty">
                  No repos yet. Add the first one below to get started.
                </div>
              ) : (
                <div className="kb-repos-list">
                  {sorted.map((repo) => (
                    <RepoCard
                      key={repo.id}
                      repo={repo}
                      busy={busyId === repo.id}
                      removing={removingId === repo.id}
                      canSetPrimary={
                        !repo.isPrimary && busyId === null && removingId === null
                      }
                      onSetPrimary={() => void handleSetPrimary(repo.id)}
                      onRemove={() => void handleRemove(repo)}
                      onRename={(next) => void handleRenameRepo(repo, next)}
                      onRetargetBranch={(next) =>
                        void handleRetargetBranch(repo, next)
                      }
                    />
                  ))}
                </div>
              )}

              {addOpen ? (
                <form
                  className="kb-repos-add"
                  onSubmit={(e) => void handleAddSubmit(e)}
                >
                  <div className="kb-sentry-label">Add repo</div>
                  <div className="kb-repos-add-pickrow">
                    <input
                      type="text"
                      className="kb-repos-add-path"
                      value={addDraft.path}
                      placeholder="/absolute/path/to/repo"
                      spellCheck={false}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setAddDraft((d) => ({ ...d, path: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="kb-btn ghost"
                      onClick={() => void handlePickFolder()}
                      disabled={adding}
                    >
                      Pick folder…
                    </button>
                  </div>
                  <div className="kb-repos-add-meta">
                    <label className="kb-sentry-row">
                      <span className="kb-sentry-label">Display name</span>
                      <input
                        type="text"
                        value={addDraft.displayName}
                        placeholder="(defaults to folder name)"
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setAddDraft((d) => ({
                            ...d,
                            displayName: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="kb-sentry-row">
                      <span className="kb-sentry-label">Target branch</span>
                      <input
                        type="text"
                        value={addDraft.targetBranch}
                        placeholder="main"
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setAddDraft((d) => ({
                            ...d,
                            targetBranch: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  {addError ? (
                    <div className="kb-sentry-error" role="alert">
                      {addError}
                    </div>
                  ) : null}
                  <div className="kb-repos-add-actions">
                    <button
                      type="button"
                      className="kb-btn ghost"
                      onClick={() => {
                        setAddOpen(false);
                        setAddDraft(EMPTY_ADD_DRAFT);
                        setAddError(null);
                      }}
                      disabled={adding}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="kb-btn primary"
                      disabled={adding || addDraft.path.trim() === ''}
                    >
                      {adding ? 'Adding…' : 'Add repo'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="kb-btn ghost kb-repos-add-toggle"
                  onClick={() => {
                    setAddOpen(true);
                    setAddError(null);
                    void handlePickFolder();
                  }}
                >
                  + Add repo
                </button>
              )}
            </>
          ) : null}
        </div>

        <div className="kb-modal-foot">
          <span className="hint">
            Repos are stored locally in <code>.kanbots/</code>. The target
            branch is a free-text input for v1; a real branch picker is a
            follow-up.
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

interface RepoCardProps {
  repo: WorkspaceRepoPayload;
  busy: boolean;
  removing: boolean;
  canSetPrimary: boolean;
  onSetPrimary: () => void;
  onRemove: () => void;
  onRename: (next: string) => void;
  onRetargetBranch: (next: string) => void;
}

function RepoCard({
  repo,
  busy,
  removing,
  canSetPrimary,
  onSetPrimary,
  onRemove,
  onRename,
  onRetargetBranch,
}: RepoCardProps) {
  const [nameDraft, setNameDraft] = useState<string>(repo.displayName ?? '');
  const [editingName, setEditingName] = useState(false);
  const [branchDraft, setBranchDraft] = useState<string>(repo.targetBranch ?? '');
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Sync local drafts back to server values whenever the row updates (e.g.
  // after a successful rename or branch save).
  useEffect(() => {
    setNameDraft(repo.displayName ?? '');
  }, [repo.displayName]);
  useEffect(() => {
    setBranchDraft(repo.targetBranch ?? '');
  }, [repo.targetBranch]);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  function commitName(): void {
    setEditingName(false);
    onRename(nameDraft);
  }

  function commitBranch(): void {
    onRetargetBranch(branchDraft);
  }

  const displayLabel =
    repo.displayName ?? repo.repoPath.split('/').filter(Boolean).pop() ?? repo.repoPath;

  return (
    <div className={`kb-repos-card${repo.isPrimary ? ' is-primary' : ''}`}>
      <div className="kb-repos-card-head">
        {editingName ? (
          <input
            ref={nameInputRef}
            type="text"
            className="kb-repos-card-name-input"
            value={nameDraft}
            placeholder={repo.repoPath.split('/').filter(Boolean).pop() ?? ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setNameDraft(e.target.value)
            }
            onBlur={commitName}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitName();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setNameDraft(repo.displayName ?? '');
                setEditingName(false);
              }
            }}
            disabled={busy || removing}
          />
        ) : (
          <button
            type="button"
            className="kb-repos-card-name"
            onClick={() => setEditingName(true)}
            title="Click to rename"
            disabled={busy || removing}
          >
            {displayLabel}
          </button>
        )}
        {repo.isPrimary ? (
          <span className="kb-repos-card-badge" aria-label="Primary repo">
            Primary
          </span>
        ) : null}
        <span className="grow" />
        {canSetPrimary ? (
          <button
            type="button"
            className="kb-btn ghost"
            onClick={onSetPrimary}
            disabled={busy || removing}
            title="Mark this repo as the workspace primary"
          >
            Set primary
          </button>
        ) : null}
        <button
          type="button"
          className="kb-btn ghost kb-repos-card-remove"
          onClick={onRemove}
          disabled={busy || removing}
          title="Remove this repo from the workspace"
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
      <div className="kb-repos-card-path">{repo.repoPath}</div>
      <label className="kb-repos-card-field">
        <span className="kb-sentry-label">Target branch</span>
        <input
          type="text"
          value={branchDraft}
          placeholder="main"
          spellCheck={false}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setBranchDraft(e.target.value)
          }
          onBlur={commitBranch}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setBranchDraft(repo.targetBranch ?? '');
            }
          }}
          disabled={busy || removing}
        />
      </label>
      {/*
        TODO: replace the free-text branch input with a select populated from
        a backend list-branches call once that channel is added.
      */}
    </div>
  );
}
