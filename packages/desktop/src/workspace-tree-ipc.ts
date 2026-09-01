import { exec, execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { clipboard, dialog, ipcMain, shell, type WebContents } from 'electron';
import { removeWorktree as removeGitWorktree } from '@kanbots/dispatcher';

const execFileAsync = promisify(execFile);

/**
 * Workspace file-tree IPC. Drives the VSCode-style tree in the LeftRail.
 *
 * Two responsibilities:
 *
 *   1. read-dir(rootPath, relPath) — lazy directory listing. Returns
 *      one level at a time so opening a large repo doesn't block the
 *      renderer.
 *
 *   2. worktree-status(rootPath) — runs `git worktree list` + a
 *      `git status --porcelain` pass over each worktree (and the main
 *      checkout). Returns a map of repo-relative-paths to {status,
 *      worktrees[]} so the tree can badge touched files.
 *
 * Live "touched right now" updates also flow on the broadcast channel
 * `workspace:touched` (see broadcastWorkspaceTouched). The renderer
 * unions the polled worktree-status snapshot with the live stream so
 * a file an agent is editing this very second flips the badge before
 * the next git poll.
 *
 * Path safety: every IPC path is resolved against the root and we
 * refuse anything that escapes it — defends against a compromised
 * renderer asking for ../etc/passwd.
 */

const execAsync = promisify(exec);

const HIDDEN_EXCLUDES = new Set<string>([
  '.git',
  '.DS_Store',
  '.kanbots',
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  '.cache',
]);

export interface TreeEntry {
  name: string;
  /** Repo-relative path with forward slashes. */
  path: string;
  type: 'file' | 'dir';
}

export interface WorktreeStatusMap {
  /** Map of repo-relative-path (forward slashes) to status info. */
  files: Record<
    string,
    {
      status: 'M' | 'A' | 'D' | 'R' | '??' | 'U';
      worktrees: string[];
    }
  >;
  /** Absolute paths of every worktree scanned (incl. main checkout). */
  worktrees: string[];
}

/**
 * Resolve a user-provided sub-path against the workspace root. Returns
 * the absolute path only if it stays inside the root; otherwise null.
 */
function resolveSafe(root: string, rel: string): string | null {
  if (rel.length === 0) return root;
  const absRoot = resolve(root);
  const target = resolve(absRoot, normalize(rel));
  if (target !== absRoot && !target.startsWith(absRoot + sep)) return null;
  return target;
}

export interface WorktreeRecord {
  path: string;
  branch: string | null;
  /** Short HEAD sha (7 chars) or null when not available. */
  head: string | null;
  /** True for the primary worktree (the repo root). */
  isMain: boolean;
  /** True if `git worktree list` flagged this entry as locked. */
  locked: boolean;
  /** True for detached-HEAD worktrees. */
  detached: boolean;
}

async function parseWorktreeList(rootPath: string): Promise<WorktreeRecord[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: rootPath,
      timeout: 5_000,
      maxBuffer: 1_048_576,
    });
    const out: WorktreeRecord[] = [];
    const absRoot = resolve(rootPath);
    let cur: Partial<WorktreeRecord> | null = null;
    function flush(): void {
      if (cur === null || cur.path === undefined) return;
      out.push({
        path: cur.path,
        branch: cur.branch ?? null,
        head: cur.head ?? null,
        isMain: resolve(cur.path) === absRoot,
        locked: cur.locked === true,
        detached: cur.detached === true,
      });
      cur = null;
    }
    for (const raw of stdout.split('\n')) {
      const line = raw.trimEnd();
      if (line.length === 0) {
        flush();
        continue;
      }
      if (line.startsWith('worktree ')) {
        flush();
        cur = { path: line.slice('worktree '.length).trim() };
      } else if (cur !== null) {
        if (line.startsWith('HEAD ')) {
          cur.head = line.slice('HEAD '.length, 'HEAD '.length + 7);
        } else if (line.startsWith('branch ')) {
          cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
        } else if (line === 'detached') {
          cur.detached = true;
        } else if (line.startsWith('locked')) {
          cur.locked = true;
        }
      }
    }
    flush();
    return out;
  } catch {
    return [{ path: rootPath, branch: null, head: null, isMain: true, locked: false, detached: false }];
  }
}

async function listWorktrees(rootPath: string): Promise<string[]> {
  const records = await parseWorktreeList(rootPath);
  return records.map((r) => r.path);
}

async function statusForWorktree(
  worktreePath: string,
): Promise<Array<{ path: string; status: string }>> {
  try {
    const { stdout } = await execAsync('git status --porcelain=v1 -z', {
      cwd: worktreePath,
      timeout: 5_000,
      maxBuffer: 4_194_304,
    });
    const out: Array<{ path: string; status: string }> = [];
    // Porcelain v1 with -z uses NUL-terminated records; the 2-char
    // status code is at positions 0-1, then a space, then the path.
    // Rename/copy records carry the old path too, separated by another
    // NUL; we only care about the destination path.
    const records = stdout.split('\0');
    for (let i = 0; i < records.length; i += 1) {
      const r = records[i];
      if (!r || r.length < 3) continue;
      const code = r.slice(0, 2).trim();
      const path = r.slice(3);
      if (code.length === 0 || path.length === 0) continue;
      out.push({ path, status: code });
      // R/C records consume the next NUL-separated source path.
      if (code.startsWith('R') || code.startsWith('C')) i += 1;
    }
    return out;
  } catch {
    return [];
  }
}

function normaliseStatus(code: string): WorktreeStatusMap['files'][string]['status'] {
  if (code === '??') return '??';
  if (code.includes('U') || code === 'AA' || code === 'DD') return 'U';
  if (code.startsWith('R')) return 'R';
  if (code.startsWith('D') || code.endsWith('D')) return 'D';
  if (code.startsWith('A')) return 'A';
  return 'M';
}

async function readDirEntries(rootPath: string, relPath: string): Promise<TreeEntry[]> {
  const absDir = resolveSafe(rootPath, relPath);
  if (absDir === null) return [];
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: TreeEntry[] = [];
  for (const ent of entries) {
    if (HIDDEN_EXCLUDES.has(ent.name)) continue;
    if (ent.name.startsWith('.')) {
      // Show dotfiles but skip the well-known dot directories already
      // captured in HIDDEN_EXCLUDES. Hidden files (.env etc.) stay
      // visible — the tree mirrors the user's source tree.
    }
    const isDir = ent.isDirectory();
    if (!isDir && !ent.isFile()) continue;
    const childRel = (relPath.length === 0 ? ent.name : `${relPath}/${ent.name}`).replace(/\\/g, '/');
    out.push({ name: ent.name, path: childRel, type: isDir ? 'dir' : 'file' });
  }
  // Folders first, then files, both alphabetised.
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

async function worktreeStatus(rootPath: string): Promise<WorktreeStatusMap> {
  const worktrees = await listWorktrees(rootPath);
  const files: WorktreeStatusMap['files'] = {};
  for (const wt of worktrees) {
    const status = await statusForWorktree(wt);
    if (status.length === 0) continue;
    for (const { path, status: code } of status) {
      // For an agent worktree, the same file may show up under a
      // different repo-relative path than the main checkout (worktree
      // root differs). Normalise to "relative to wt itself" — the
      // renderer matches against the file tree it reads from `rootPath`,
      // and for the main checkout that's the same path; for agent
      // worktrees we just want the user to know "something elsewhere
      // is touching X" so the path-as-key still surfaces correctly.
      const rel = path.replace(/\\/g, '/');
      const prev = files[rel];
      if (prev === undefined) {
        files[rel] = { status: normaliseStatus(code), worktrees: [wt] };
      } else if (!prev.worktrees.includes(wt)) {
        prev.worktrees.push(wt);
      }
    }
  }
  return { files, worktrees };
}

let resolveRoot: (() => string | null) | null = null;
let broadcaster: ((payload: { filePath: string; worktreePath: string | null }) => void) | null = null;
const senders = new Set<WebContents>();

export interface WorkspaceTreeIpcOptions {
  /**
   * Returns the absolute path of the current local repo root, or null
   * if no workspace (cloud or local) is currently open / no cloud
   * project is bound to a local repo yet.
   */
  getCurrentRepoRoot: () => string | null;
}

export function registerWorkspaceTreeIpc(opts: WorkspaceTreeIpcOptions): void {
  resolveRoot = opts.getCurrentRepoRoot;

  ipcMain.handle(
    'kanbots:workspace:current-root',
    async (): Promise<{ repoRoot: string | null }> => ({
      repoRoot: resolveRoot ? resolveRoot() : null,
    }),
  );

  ipcMain.handle(
    'kanbots:workspace:read-dir',
    async (
      _event,
      args: { rootPath: string; relPath: string },
    ): Promise<TreeEntry[]> => {
      const root = resolveRoot ? resolveRoot() : null;
      // The renderer always sends rootPath echoed back from
      // current-root, but we re-verify against the live root so a
      // stale renderer can't read from a closed-workspace path.
      if (root === null || resolve(args.rootPath) !== resolve(root)) return [];
      if (!isAbsolute(root)) return [];
      try {
        const s = await stat(root);
        if (!s.isDirectory()) return [];
      } catch {
        return [];
      }
      return readDirEntries(root, args.relPath ?? '');
    },
  );

  ipcMain.handle(
    'kanbots:workspace:worktree-status',
    async (_event, args: { rootPath: string }): Promise<WorktreeStatusMap> => {
      const root = resolveRoot ? resolveRoot() : null;
      if (root === null || resolve(args.rootPath) !== resolve(root)) {
        return { files: {}, worktrees: [] };
      }
      return worktreeStatus(root);
    },
  );

  ipcMain.handle('kanbots:workspace:subscribe-touched', async (event): Promise<void> => {
    const wc = event.sender;
    if (senders.has(wc)) return;
    senders.add(wc);
    wc.on('destroyed', () => senders.delete(wc));
  });

  // Per-repo status (branch + ahead/behind + dirty count) lives on the
  // workspace-handler bridge as `workspace:repo-status`, routed through
  // the standard `kanbots:invoke:` prefix so it can reuse the same
  // workspace_repos lookup and validation as the rest of the multi-repo
  // surface. See `repoStatus` in packages/api/src/handlers/workspace.ts.
  // The rail switcher caches per-row results for ~30s so opening the
  // menu doesn't fan out one git invocation per row on every render.

  /**
   * Returns every git worktree under the active repo, augmented with a
   * dirty-file count derived from the same status sweep used by the
   * tree badges. The renderer drives the Worktrees rail section off
   * this — branch labels, "3 changes" hints, action buttons.
   */
  ipcMain.handle(
    'kanbots:workspace:list-worktrees',
    async (_event, args: { rootPath: string }): Promise<
      Array<WorktreeRecord & { dirtyCount: number }>
    > => {
      const root = resolveRoot ? resolveRoot() : null;
      if (root === null || resolve(args.rootPath) !== resolve(root)) return [];
      const records = await parseWorktreeList(root);
      const out: Array<WorktreeRecord & { dirtyCount: number }> = [];
      for (const rec of records) {
        const status = await statusForWorktree(rec.path);
        out.push({ ...rec, dirtyCount: status.length });
      }
      return out;
    },
  );

  /** Show the worktree directory in the host file manager. */
  ipcMain.handle(
    'kanbots:workspace:reveal-path',
    async (_event, args: { path: string }): Promise<{ ok: boolean; error?: string }> => {
      // Defence: only reveal a path that lives inside the active repo
      // root or one of its worktrees. Prevents a compromised renderer
      // from reading arbitrary directories.
      const root = resolveRoot ? resolveRoot() : null;
      if (root === null) return { ok: false, error: 'no active workspace' };
      const records = await parseWorktreeList(root);
      const allowed = records.some((r) => resolve(r.path) === resolve(args.path));
      if (!allowed) return { ok: false, error: 'path is not a worktree of the active repo' };
      try {
        const err = await shell.openPath(args.path);
        if (err) return { ok: false, error: err };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  /** Copy a worktree path to the system clipboard. */
  ipcMain.handle(
    'kanbots:workspace:copy-path',
    async (_event, args: { path: string }): Promise<{ ok: boolean }> => {
      const root = resolveRoot ? resolveRoot() : null;
      if (root === null) return { ok: false };
      const records = await parseWorktreeList(root);
      const allowed = records.some((r) => resolve(r.path) === resolve(args.path));
      if (!allowed) return { ok: false };
      clipboard.writeText(args.path);
      return { ok: true };
    },
  );

  /**
   * Remove a worktree via `git worktree remove`. The main worktree is
   * never removable; agent-created worktrees with dirty/in-flight
   * state require `force = true` from the caller (the renderer
   * surfaces a confirm dialog).
   */
  ipcMain.handle(
    'kanbots:workspace:remove-worktree',
    async (
      _event,
      args: { path: string; force?: boolean },
    ): Promise<{ ok: boolean; error?: string }> => {
      const root = resolveRoot ? resolveRoot() : null;
      if (root === null) return { ok: false, error: 'no active workspace' };
      const records = await parseWorktreeList(root);
      const target = records.find((r) => resolve(r.path) === resolve(args.path));
      if (target === undefined) return { ok: false, error: 'not a worktree of the active repo' };
      if (target.isMain) return { ok: false, error: 'cannot remove the main worktree' };
      const choice = await dialog.showMessageBox({
        type: 'warning',
        title: 'Remove worktree?',
        message: `Remove worktree '${target.branch ?? target.path}'?`,
        detail:
          'This deletes the worktree directory and disconnects the branch from this repo. '
          + (args.force ? 'Uncommitted changes will be lost.' : ''),
        buttons: ['Cancel', 'Remove'],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice.response !== 1) return { ok: false, error: 'cancelled' };
      try {
        await removeGitWorktree({
          repoPath: root,
          worktreePath: target.path,
          ...(args.force === true ? { force: true } : {}),
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  broadcaster = (payload) => {
    for (const wc of senders) {
      if (wc.isDestroyed()) {
        senders.delete(wc);
        continue;
      }
      try {
        wc.send('kanbots:workspace:touched', payload);
      } catch {
        // ignore broken sender
      }
    }
  };

  /**
   * Return the HEAD and current contents of a file inside a worktree
   * (or the bound repo's main checkout). Used by the FileChangeViewer
   * modal to render an InlineDiff. `null` for either text means the
   * file doesn't exist on that side — added vs. deleted.
   */
  ipcMain.handle(
    'kanbots:workspace:file-diff',
    async (
      _event,
      args: { worktreePath: string; filePath: string },
    ): Promise<{
      status: 'M' | 'A' | 'D' | 'R' | '??' | 'U' | null;
      oldText: string | null;
      newText: string | null;
    }> => {
      const root = resolveRoot ? resolveRoot() : null;
      if (root === null) return { status: null, oldText: null, newText: null };
      // Defence: the worktree must belong to the active repo's
      // `git worktree list` set so a compromised renderer can't ask
      // us to diff an arbitrary file.
      const allowed = await listWorktrees(root);
      const wtAbs = resolve(args.worktreePath);
      if (!allowed.some((w) => resolve(w) === wtAbs)) {
        return { status: null, oldText: null, newText: null };
      }
      // And the file path itself must resolve inside the worktree.
      const fileAbs = resolve(wtAbs, normalize(args.filePath));
      if (fileAbs !== wtAbs && !fileAbs.startsWith(wtAbs + sep)) {
        return { status: null, oldText: null, newText: null };
      }
      const relFromWt = relative(wtAbs, fileAbs).split(sep).join('/');

      // Pull the porcelain status for this specific file so we know
      // whether we're rendering a Modify / Add / Delete view.
      let status: 'M' | 'A' | 'D' | 'R' | '??' | 'U' | null = null;
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['status', '--porcelain=v1', '-z', '--', relFromWt],
          { cwd: wtAbs, timeout: 5_000, maxBuffer: 524_288 },
        );
        const rec = stdout.split('\0').find((r) => r.length >= 3);
        if (rec !== undefined) status = normaliseStatus(rec.slice(0, 2).trim());
      } catch {
        // file is clean / git missing — fall through with status=null
      }

      // Old text: `git show HEAD:<path>`. Treat any error (e.g. the
      // file is new and not in HEAD) as "no old text".
      let oldText: string | null = null;
      try {
        const { stdout } = await execFileAsync('git', ['show', `HEAD:${relFromWt}`], {
          cwd: wtAbs,
          timeout: 5_000,
          maxBuffer: 4_194_304,
          encoding: 'utf8',
        });
        oldText = stdout;
      } catch {
        oldText = null;
      }

      // New text: read the file from disk. Missing file (deletion) is
      // expected; surface as null.
      let newText: string | null = null;
      try {
        newText = await readFile(join(wtAbs, relFromWt), 'utf8');
      } catch {
        newText = null;
      }

      return { status, oldText, newText };
    },
  );

  /**
   * Read a file's current contents from the bound repo's main checkout
   * for the read-only file viewer. Mirrors `file-diff`'s safety model:
   * the path must resolve inside the active repo root. Bails on files
   * larger than MAX_FILE_READ_BYTES so the renderer never has to handle
   * a 50 MB blob, and probes for NUL bytes to flag binary content so
   * the viewer can show a "binary file" stub instead of garbled text.
   */
  ipcMain.handle(
    'kanbots:workspace:file-read',
    async (
      _event,
      args: { filePath: string },
    ): Promise<{
      content: string | null;
      size: number;
      truncated: boolean;
      isBinary: boolean;
      error: string | null;
    }> => {
      const root = resolveRoot ? resolveRoot() : null;
      if (root === null) {
        return { content: null, size: 0, truncated: false, isBinary: false, error: 'no active workspace' };
      }
      const rootAbs = resolve(root);
      const fileAbs = resolveSafe(rootAbs, args.filePath);
      if (fileAbs === null) {
        return { content: null, size: 0, truncated: false, isBinary: false, error: 'path escapes workspace' };
      }
      try {
        const st = await stat(fileAbs);
        if (!st.isFile()) {
          return { content: null, size: 0, truncated: false, isBinary: false, error: 'not a file' };
        }
        const size = st.size;
        const truncated = size > MAX_FILE_READ_BYTES;
        const buf = await readFile(fileAbs);
        // Binary heuristic: any NUL byte in the first 8 KB is a strong
        // signal it's not text. Cheap and aligns with what `file` does.
        const head = buf.subarray(0, Math.min(8192, buf.length));
        const isBinary = head.includes(0);
        if (isBinary) {
          return { content: null, size, truncated: false, isBinary: true, error: null };
        }
        const slice = truncated ? buf.subarray(0, MAX_FILE_READ_BYTES) : buf;
        return {
          content: slice.toString('utf8'),
          size,
          truncated,
          isBinary: false,
          error: null,
        };
      } catch (err) {
        return {
          content: null,
          size: 0,
          truncated: false,
          isBinary: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
}

const MAX_FILE_READ_BYTES = 2 * 1024 * 1024;

/**
 * Forward a file edit from a live agent run to subscribed renderers.
 * Callers: the cloud run dispatcher and the local supervisor's stream
 * handler, when they see a tool_use event whose tool is Edit / Write /
 * MultiEdit. `filePath` is whatever the tool received — we don't
 * normalise here because matching is done renderer-side against the
 * file tree's repo-relative paths (suffix match).
 */
export function broadcastWorkspaceTouched(payload: {
  filePath: string;
  worktreePath: string | null;
}): void {
  if (broadcaster !== null) broadcaster(payload);
}

/**
 * Best-effort relative-path-from-root computer for callers that have
 * an absolute file path but want to emit something the tree can match.
 */
export function repoRelativePath(absPath: string): string | null {
  const root = resolveRoot ? resolveRoot() : null;
  if (root === null) return null;
  const rel = relative(root, absPath);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

