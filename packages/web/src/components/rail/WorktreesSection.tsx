import { useCallback, useEffect, useRef, useState } from 'react';
import { getBridge } from '../../desktop-bridge.js';
import { CollapsibleSection } from './CollapsibleSection.js';

/**
 * Active worktrees panel. Lists every entry from `git worktree list`
 * under the bound local repo, augmented with a dirty-file count so the
 * user can see at a glance which branches have uncommitted work. Each
 * row carries a small action menu: reveal in folder, copy path, remove.
 */

interface Worktree {
  path: string;
  branch: string | null;
  head: string | null;
  isMain: boolean;
  locked: boolean;
  detached: boolean;
  dirtyCount: number;
}

const POLL_INTERVAL_MS = 10_000;

function shortenPath(path: string): string {
  const home = (window as unknown as { kanbots?: { homeDir?: string } }).kanbots?.homeDir;
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 4) return path;
  return `.../${parts.slice(-3).join('/')}`;
}

export function WorktreesSection() {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [worktrees, setWorktrees] = useState<Worktree[] | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge || rootPath === null) {
      setWorktrees(null);
      return;
    }
    try {
      const list = await bridge.workspaceListWorktrees({ rootPath });
      setWorktrees(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [rootPath]);

  // Resolve the active repo root; revisit periodically so a closed
  // workspace or a newly-bound cloud project takes effect without
  // a renderer reload.
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    let cancelled = false;
    async function probe(): Promise<void> {
      try {
        const { repoRoot } = await bridge!.workspaceCurrentRoot();
        if (cancelled) return;
        setRootPath((prev) => (prev === repoRoot ? prev : repoRoot));
      } catch {
        // ignore
      }
    }
    void probe();
    const id = window.setInterval(() => void probe(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    void refresh();
    if (rootPath === null) return;
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh, rootPath]);

  // Close the action menu on outside click / Escape.
  useEffect(() => {
    if (openMenu === null) return;
    function onPointerDown(e: PointerEvent): void {
      if (!menuRef.current) return;
      if (e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpenMenu(null);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  async function doAction(action: 'reveal' | 'copy' | 'remove', path: string): Promise<void> {
    const bridge = getBridge();
    if (!bridge) return;
    setOpenMenu(null);
    setBusyPath(path);
    setError(null);
    try {
      if (action === 'reveal') {
        const res = await bridge.workspaceRevealPath({ path });
        if (!res.ok && res.error) setError(res.error);
      } else if (action === 'copy') {
        await bridge.workspaceCopyPath({ path });
      } else if (action === 'remove') {
        // Pre-check the worktree's current dirty state; if anything is
        // uncommitted, ask for `force: true` up front so the user sees
        // one confirm dialog that names the destructive consequence,
        // not two ("Remove?" -> error -> "Force?").
        const target = worktrees?.find((w) => w.path === path);
        const force = (target?.dirtyCount ?? 0) > 0;
        const res = await bridge.workspaceRemoveWorktree({ path, ...(force ? { force } : {}) });
        if (!res.ok && res.error && res.error !== 'cancelled') setError(res.error);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyPath(null);
    }
  }

  if (rootPath === null) return null;
  if (worktrees === null) return null;
  if (worktrees.length === 0) return null;

  return (
    <CollapsibleSection
      storageKey="worktrees"
      className="kb-rail-worktrees"
      label="Worktrees"
      trailing={
        <span className="kb-rail-label-count" aria-label={`${worktrees.length} total`}>
          {worktrees.length}
        </span>
      }
    >
      {error ? <div className="kb-rail-worktree-error">{error}</div> : null}
      <div className="kb-rail-worktree-list" ref={menuRef}>
        {worktrees.map((w) => {
          const label = w.branch ?? (w.detached ? `(detached ${w.head ?? ''})` : '(unknown)');
          const dirtyLabel = w.dirtyCount === 0 ? 'clean' : `${w.dirtyCount} change${w.dirtyCount === 1 ? '' : 's'}`;
          const menuOpen = openMenu === w.path;
          const busy = busyPath === w.path;
          return (
            <div key={w.path} className={`kb-worktree-row${w.isMain ? ' is-main' : ''}${busy ? ' is-busy' : ''}`}>
              <div className="kb-worktree-meta">
                <div className="kb-worktree-branch">
                  <span className="kb-worktree-glyph" aria-hidden>
                    {w.isMain ? '◉' : w.detached ? '◌' : '◇'}
                  </span>
                  <span className="kb-worktree-branch-name">{label}</span>
                  {w.isMain ? <span className="kb-worktree-tag">main</span> : null}
                  {w.locked ? <span className="kb-worktree-tag">locked</span> : null}
                </div>
                <div className="kb-worktree-path" title={w.path}>
                  {shortenPath(w.path)}
                </div>
                <div className={`kb-worktree-dirty ${w.dirtyCount === 0 ? 'is-clean' : 'is-dirty'}`}>
                  {dirtyLabel}
                </div>
              </div>
              <button
                type="button"
                className="kb-worktree-menu-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setOpenMenu(menuOpen ? null : w.path)}
                disabled={busy}
                title="Actions"
              >
                ⋯
              </button>
              {menuOpen ? (
                <div className="kb-worktree-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="kb-worktree-menu-item"
                    onClick={() => void doAction('reveal', w.path)}
                  >
                    <span aria-hidden>📂</span> Reveal in file manager
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="kb-worktree-menu-item"
                    onClick={() => void doAction('copy', w.path)}
                  >
                    <span aria-hidden>📋</span> Copy path
                  </button>
                  {!w.isMain ? (
                    <>
                      <div className="kb-worktree-menu-sep" role="separator" />
                      <button
                        type="button"
                        role="menuitem"
                        className="kb-worktree-menu-item is-destructive"
                        onClick={() => void doAction('remove', w.path)}
                      >
                        <span aria-hidden>🗑</span> Remove worktree
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
