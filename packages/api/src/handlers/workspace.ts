import { exec, execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  HOUSE_RULES_MAX_BYTES,
  readWorkspaceConfig,
  WORKSPACE_SCRIPT_MAX_BYTES,
  writeWorkspaceConfig,
  type WorkspaceConfig,
  type WorkspaceRepo,
  type WorkspaceScriptKind,
  type WorkspaceScripts,
} from '@kanbots/local-store';
import type {
  Workspace,
  WorkspaceBudgets,
  WorkspaceFolderPayload,
  WorkspaceHouseRules,
  WorkspaceRepoPayload,
  WorkspaceRepoStatus,
} from '../bridge.js';

const execFileAsync = promisify(execFile);
import { bootstrapWorkspace } from '../workspace-bootstrap.js';
import { badRequest, notFound, parseArgs } from './errors.js';
import type { HandlerDeps } from './types.js';

const SCRIPT_KIND_SET: readonly WorkspaceScriptKind[] = ['devServer', 'setup', 'cleanup'];
const RUN_SCRIPT_TIMEOUT_MS = 5 * 60 * 1000;
const RUN_SCRIPT_OUTPUT_CAP = 64 * 1024;

const addFolderSchema = z
  .object({
    name: z.string().min(1).max(120),
    path: z.string().min(1).max(2048),
    defaultBranch: z.string().min(1).max(120).optional(),
  })
  .strict();

export interface AddFolderArgs {
  name: string;
  path: string;
  defaultBranch?: string;
}

export async function getWorkspace(deps: HandlerDeps): Promise<Workspace> {
  if (!deps.config.repoPath) {
    return { id: 'default', name: 'kanbots workspace', currentFolderId: 'unknown' };
  }
  const { workspace, currentFolder } = bootstrapWorkspace(
    deps.store,
    deps.config,
    deps.config.repoPath,
  );
  return {
    id: workspace.id,
    name: workspace.name,
    currentFolderId: currentFolder.id,
  };
}

export async function listFolders(
  deps: HandlerDeps,
): Promise<WorkspaceFolderPayload[]> {
  if (!deps.config.repoPath) return [];
  const { workspace, currentFolder } = bootstrapWorkspace(
    deps.store,
    deps.config,
    deps.config.repoPath,
  );
  const rows = deps.store.folders.listByWorkspace(workspace.id);
  return rows.map((f) => ({
    id: f.id,
    workspaceId: f.workspaceId,
    name: f.name,
    path: f.path,
    defaultBranch: f.defaultBranch,
    addedAt: f.addedAt,
    current: f.id === currentFolder.id,
  }));
}

const setBudgetsSchema = z
  .object({
    runCostBudgetUsd: z.number().positive().nullable(),
    sessionCostBudgetUsd: z.number().positive().nullable(),
  })
  .strict();

export async function getBudgets(deps: HandlerDeps): Promise<WorkspaceBudgets> {
  if (!deps.budgets) {
    return { runCostBudgetUsd: null, sessionCostBudgetUsd: null };
  }
  return deps.budgets.get();
}

export async function setBudgets(
  deps: HandlerDeps,
  args: WorkspaceBudgets,
): Promise<WorkspaceBudgets> {
  const parsed = parseArgs(setBudgetsSchema, args);
  if (!deps.budgets) {
    throw badRequest('host has no active workspace');
  }
  await deps.budgets.set(parsed);
  return deps.budgets.get();
}

const setHouseRulesSchema = z
  .object({
    houseRules: z.string().nullable(),
  })
  .strict();

export async function getHouseRules(deps: HandlerDeps): Promise<WorkspaceHouseRules> {
  if (!deps.houseRules) return { houseRules: null };
  return deps.houseRules.get();
}

export async function setHouseRules(
  deps: HandlerDeps,
  args: WorkspaceHouseRules,
): Promise<WorkspaceHouseRules> {
  const parsed = parseArgs(setHouseRulesSchema, args);
  if (!deps.houseRules) throw badRequest('host has no active workspace');
  let next: string | null;
  if (parsed.houseRules === null) {
    next = null;
  } else {
    const trimmed = parsed.houseRules.trim();
    if (trimmed.length === 0) {
      next = null;
    } else if (Buffer.byteLength(trimmed, 'utf8') > HOUSE_RULES_MAX_BYTES) {
      throw badRequest(`houseRules exceeds ${HOUSE_RULES_MAX_BYTES} bytes`);
    } else {
      next = trimmed;
    }
  }
  await deps.houseRules.set({ houseRules: next });
  return deps.houseRules.get();
}

const setScriptsSchema = z
  .object({
    devServer: z.string().nullable().optional(),
    setup: z.string().nullable().optional(),
    cleanup: z.string().nullable().optional(),
  })
  .strict();

export interface WorkspaceScriptsPayload {
  scripts: WorkspaceScripts;
}

export async function getScripts(deps: HandlerDeps): Promise<WorkspaceScriptsPayload> {
  if (!deps.config.repoPath) return { scripts: {} };
  try {
    const cfg = await readWorkspaceConfig(deps.config.repoPath);
    return { scripts: cfg?.scripts ?? {} };
  } catch {
    return { scripts: {} };
  }
}

export async function setScripts(
  deps: HandlerDeps,
  args: { devServer?: string | null; setup?: string | null; cleanup?: string | null },
): Promise<WorkspaceScriptsPayload> {
  const parsed = parseArgs(setScriptsSchema, args);
  if (!deps.config.repoPath) throw badRequest('host has no active workspace');

  const next: WorkspaceScripts = {};
  for (const kind of SCRIPT_KIND_SET) {
    const v = parsed[kind];
    if (v === undefined) continue;
    if (v === null) continue; // null → unset
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    if (Buffer.byteLength(trimmed, 'utf8') > WORKSPACE_SCRIPT_MAX_BYTES) {
      throw badRequest(`script "${kind}" exceeds ${WORKSPACE_SCRIPT_MAX_BYTES} bytes`);
    }
    next[kind] = trimmed;
  }

  // Merge into existing config so we don't overwrite other workspace fields.
  // If config.json doesn't exist yet we can't safely write — workspace
  // bootstrap is the source of truth for the mode/owner/name fields.
  const existing = await readWorkspaceConfig(deps.config.repoPath);
  if (!existing) throw badRequest('workspace config has not been initialised yet');

  // Merge into the existing config, preserving the discriminated-union
  // mode. Only include the scripts key when at least one script is set —
  // otherwise we'd violate `exactOptionalPropertyTypes`.
  const hasScripts = Object.keys(next).length > 0;
  const merged: WorkspaceConfig =
    existing.mode === 'github'
      ? hasScripts
        ? { ...existing, scripts: next }
        : (() => {
            const { scripts: _omit, ...rest } = existing;
            return rest;
          })()
      : hasScripts
        ? { ...existing, scripts: next }
        : (() => {
            const { scripts: _omit, ...rest } = existing;
            return rest;
          })();

  await writeWorkspaceConfig(deps.config.repoPath, merged);
  return { scripts: hasScripts ? next : {} };
}

const setAcpCommandSchema = z
  .object({
    acpCommand: z.string().nullable(),
  })
  .strict();

export interface WorkspaceAcpCommandPayload {
  acpCommand: string | null;
}

export async function getAcpCommand(deps: HandlerDeps): Promise<WorkspaceAcpCommandPayload> {
  if (deps.acpCommand) return deps.acpCommand.get();
  if (!deps.config.repoPath) return { acpCommand: null };
  try {
    const cfg = await readWorkspaceConfig(deps.config.repoPath);
    return { acpCommand: cfg?.acpCommand ?? null };
  } catch {
    return { acpCommand: null };
  }
}

export async function setAcpCommand(
  deps: HandlerDeps,
  args: { acpCommand: string | null },
): Promise<WorkspaceAcpCommandPayload> {
  const parsed = parseArgs(setAcpCommandSchema, args);
  if (!deps.acpCommand) throw badRequest('host has no active workspace');

  let next: string | null;
  if (parsed.acpCommand === null) {
    next = null;
  } else {
    const trimmed = parsed.acpCommand.trim();
    if (trimmed.length === 0) {
      next = null;
    } else if (Buffer.byteLength(trimmed, 'utf8') > WORKSPACE_SCRIPT_MAX_BYTES) {
      throw badRequest(`acpCommand exceeds ${WORKSPACE_SCRIPT_MAX_BYTES} bytes`);
    } else {
      next = trimmed;
    }
  }

  await deps.acpCommand.set({ acpCommand: next });
  return deps.acpCommand.get();
}

const runScriptSchema = z
  .object({
    kind: z.enum(['setup', 'cleanup']),
  })
  .strict();

export interface RunScriptResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  error?: string;
}

export async function runScript(
  deps: HandlerDeps,
  args: { kind: 'setup' | 'cleanup' },
): Promise<RunScriptResult> {
  const parsed = parseArgs(runScriptSchema, args);
  if (!deps.config.repoPath) throw badRequest('host has no active workspace');
  const cfg = await readWorkspaceConfig(deps.config.repoPath);
  const script = cfg?.scripts?.[parsed.kind];
  if (!script) {
    return {
      ok: false,
      exitCode: null,
      stdout: '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
      error: `no ${parsed.kind} script is configured`,
    };
  }
  return await new Promise<RunScriptResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    const child = exec(
      script,
      {
        cwd: deps.config.repoPath,
        timeout: RUN_SCRIPT_TIMEOUT_MS,
        maxBuffer: RUN_SCRIPT_OUTPUT_CAP * 2,
        env: { ...process.env },
      },
      (err) => {
        if (err && (err as unknown as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
          resolve({
            ok: false,
            exitCode: null,
            stdout,
            stderr,
            stdoutTruncated,
            stderrTruncated,
            error: `script timed out after ${Math.round(RUN_SCRIPT_TIMEOUT_MS / 1000)}s`,
          });
          return;
        }
        const exitCode = child.exitCode ?? (err ? 1 : 0);
        resolve({
          ok: exitCode === 0,
          exitCode,
          stdout,
          stderr,
          stdoutTruncated,
          stderrTruncated,
          ...(err && exitCode !== 0 ? { error: err.message } : {}),
        });
      },
    );
    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (stdout.length + text.length > RUN_SCRIPT_OUTPUT_CAP) {
        stdout = (stdout + text).slice(0, RUN_SCRIPT_OUTPUT_CAP);
        stdoutTruncated = true;
      } else {
        stdout += text;
      }
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (stderr.length + text.length > RUN_SCRIPT_OUTPUT_CAP) {
        stderr = (stderr + text).slice(0, RUN_SCRIPT_OUTPUT_CAP);
        stderrTruncated = true;
      } else {
        stderr += text;
      }
    });
  });
}

export async function addFolder(
  deps: HandlerDeps,
  args: AddFolderArgs,
): Promise<WorkspaceFolderPayload> {
  const parsed = parseArgs(addFolderSchema, args);
  if (!deps.config.repoPath) {
    throw badRequest('host has no active workspace');
  }
  const { workspace } = bootstrapWorkspace(
    deps.store,
    deps.config,
    deps.config.repoPath,
  );
  const id = `manual-${Date.now()}`;
  const folder = deps.store.folders.ensure({
    id,
    workspaceId: workspace.id,
    name: parsed.name,
    path: parsed.path,
    ...(parsed.defaultBranch !== undefined
      ? { defaultBranch: parsed.defaultBranch }
      : {}),
  });
  return {
    id: folder.id,
    workspaceId: folder.workspaceId,
    name: folder.name,
    path: folder.path,
    defaultBranch: folder.defaultBranch,
    addedAt: folder.addedAt,
    current: false,
  };
}

// --- Multi-repo workspace handlers ----------------------------------------

const addRepoSchema = z
  .object({
    repoPath: z.string().min(1).max(2048),
    displayName: z.string().min(1).max(120).optional(),
    targetBranch: z.string().min(1).max(255).optional(),
  })
  .strict();

const repoIdSchema = z.object({ id: z.number().int().positive() }).strict();

const setTargetBranchSchema = z
  .object({
    id: z.number().int().positive(),
    targetBranch: z.string().min(1).max(255).nullable(),
  })
  .strict();

const setDisplayNameSchema = z
  .object({
    id: z.number().int().positive(),
    displayName: z.string().min(1).max(120).nullable(),
  })
  .strict();

function toRepoPayload(r: WorkspaceRepo): WorkspaceRepoPayload {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    repoPath: r.repoPath,
    displayName: r.displayName,
    targetBranch: r.targetBranch,
    isPrimary: r.isPrimary,
    addedAt: r.addedAt,
  };
}

/**
 * Resolve the workspace that all multi-repo handlers operate against. The
 * host registers handlers per-workspace; when no workspace is mounted (no
 * repoPath in config) the call is refused — there's nothing to attach
 * additional repos to. When a workspace IS mounted, `bootstrapWorkspace`
 * guarantees the workspace + its primary folder row exist so subsequent
 * primary lookups always succeed.
 */
function requireWorkspaceId(deps: HandlerDeps): string {
  if (!deps.config.repoPath) {
    throw badRequest('host has no active workspace');
  }
  const { workspace } = bootstrapWorkspace(
    deps.store,
    deps.config,
    deps.config.repoPath,
  );
  return workspace.id;
}

function requireRepoBelongsTo(
  deps: HandlerDeps,
  workspaceId: string,
  id: number,
): WorkspaceRepo {
  const repo = deps.store.workspaceRepos.findById(id);
  if (!repo) throw notFound(`workspace repo ${id} not found`);
  if (repo.workspaceId !== workspaceId) {
    throw notFound(`workspace repo ${id} not found`);
  }
  return repo;
}

export async function listRepos(
  deps: HandlerDeps,
): Promise<WorkspaceRepoPayload[]> {
  if (!deps.config.repoPath) return [];
  const workspaceId = requireWorkspaceId(deps);
  // bootstrapWorkspace ran during requireWorkspaceId, so the workspace's
  // primary folder row exists; on first read after migration 0025, the
  // backfill rows for this workspace already cover that primary. If a
  // brand-new workspace was just bootstrapped (no pre-existing folders),
  // mirror its primary folder into workspace_repos so the renderer's
  // initial list isn't empty for single-repo workspaces.
  let rows = deps.store.workspaceRepos.listByWorkspace(workspaceId);
  if (rows.length === 0 && deps.config.repoPath) {
    deps.store.workspaceRepos.add({
      workspaceId,
      repoPath: deps.config.repoPath,
      primary: true,
    });
    rows = deps.store.workspaceRepos.listByWorkspace(workspaceId);
  }
  return rows.map(toRepoPayload);
}

export async function addRepo(
  deps: HandlerDeps,
  args: { repoPath: string; displayName?: string; targetBranch?: string },
): Promise<WorkspaceRepoPayload> {
  const parsed = parseArgs(addRepoSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  if (!isAbsolute(parsed.repoPath)) {
    throw badRequest('repoPath must be an absolute path');
  }
  if (!existsSync(join(parsed.repoPath, '.git'))) {
    throw badRequest('not a git repo');
  }
  // First attached repo for the workspace becomes the primary automatically
  // so callers don't have to make a separate setPrimary call after the
  // very first add. Subsequent adds default to non-primary; renderer flips
  // them explicitly via repos-set-primary if needed.
  const existing = deps.store.workspaceRepos.listByWorkspace(workspaceId);
  const primary = existing.length === 0;
  const repo = deps.store.workspaceRepos.add({
    workspaceId,
    repoPath: parsed.repoPath,
    ...(parsed.displayName !== undefined ? { displayName: parsed.displayName } : {}),
    ...(parsed.targetBranch !== undefined ? { targetBranch: parsed.targetBranch } : {}),
    primary,
  });
  return toRepoPayload(repo);
}

export async function removeRepo(
  deps: HandlerDeps,
  args: { id: number },
): Promise<{ ok: boolean }> {
  const parsed = parseArgs(repoIdSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  requireRepoBelongsTo(deps, workspaceId, parsed.id);
  // v1: allow removing any repo (including the primary). If active runs
  // are pinned to worktrees backed by this repo, the renderer should warn
  // the user before invoking this — kept loose so the storage layer
  // doesn't have to know about supervisor state.
  deps.store.workspaceRepos.remove(parsed.id);
  return { ok: true };
}

export async function setPrimaryRepo(
  deps: HandlerDeps,
  args: { id: number },
): Promise<WorkspaceRepoPayload[]> {
  const parsed = parseArgs(repoIdSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  requireRepoBelongsTo(deps, workspaceId, parsed.id);
  deps.store.workspaceRepos.setPrimary(workspaceId, parsed.id);
  return deps.store.workspaceRepos
    .listByWorkspace(workspaceId)
    .map(toRepoPayload);
}

export async function setRepoTargetBranch(
  deps: HandlerDeps,
  args: { id: number; targetBranch: string | null },
): Promise<WorkspaceRepoPayload> {
  const parsed = parseArgs(setTargetBranchSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  requireRepoBelongsTo(deps, workspaceId, parsed.id);
  deps.store.workspaceRepos.setTargetBranch(parsed.id, parsed.targetBranch);
  const fresh = deps.store.workspaceRepos.findById(parsed.id);
  if (!fresh) throw notFound(`workspace repo ${parsed.id} not found`);
  return toRepoPayload(fresh);
}

export async function setRepoDisplayName(
  deps: HandlerDeps,
  args: { id: number; displayName: string | null },
): Promise<WorkspaceRepoPayload> {
  const parsed = parseArgs(setDisplayNameSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  requireRepoBelongsTo(deps, workspaceId, parsed.id);
  deps.store.workspaceRepos.setDisplayName(parsed.id, parsed.displayName);
  const fresh = deps.store.workspaceRepos.findById(parsed.id);
  if (!fresh) throw notFound(`workspace repo ${parsed.id} not found`);
  return toRepoPayload(fresh);
}

const repoStatusSchema = z.object({ repoId: z.number().int().positive() }).strict();

/**
 * Per-repo git status snapshot for the rail switcher. Runs three reads
 * concurrently and tolerates any individual failure — a missing target
 * branch (no upstream yet) shouldn't blank out the whole row.
 *
 * `git rev-list --left-right --count <target>...HEAD` emits
 *   "<behind>\t<ahead>"
 * so a single porcelain command gives us both counts in one shell-out.
 */
export async function repoStatus(
  deps: HandlerDeps,
  args: { repoId: number },
): Promise<WorkspaceRepoStatus> {
  const parsed = parseArgs(repoStatusSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  const repo = requireRepoBelongsTo(deps, workspaceId, parsed.repoId);

  const cwd = repo.repoPath;
  const targetBranch = repo.targetBranch ?? 'main';

  const [branchResult, revResult, dirtyResult] = await Promise.allSettled([
    execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    }),
    execFileAsync(
      'git',
      ['rev-list', '--left-right', '--count', `${targetBranch}...HEAD`],
      {
        cwd,
        encoding: 'utf8',
        timeout: 5_000,
        maxBuffer: 64 * 1024,
      },
    ),
    execFileAsync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      timeout: 5_000,
      maxBuffer: 4 * 1024 * 1024,
    }),
  ]);

  let branch: string | null = null;
  if (branchResult.status === 'fulfilled') {
    const trimmed = branchResult.value.stdout.trim();
    branch = trimmed.length > 0 ? trimmed : null;
  }

  let aheadCount = 0;
  let behindCount = 0;
  if (revResult.status === 'fulfilled') {
    const parts = revResult.value.stdout.trim().split(/\s+/);
    behindCount = parseInt(parts[0] ?? '0', 10) || 0;
    aheadCount = parseInt(parts[1] ?? '0', 10) || 0;
  }

  let dirtyCount = 0;
  if (dirtyResult.status === 'fulfilled') {
    dirtyCount = dirtyResult.value.stdout
      .split('\n')
      .filter((l) => l.trim().length > 0).length;
  }

  return { branch, aheadCount, behindCount, dirtyCount };
}

const openRepoInIdeSchema = z
  .object({
    repoId: z.number().int().positive(),
    ide: z.enum(['vscode', 'cursor', 'system']).optional(),
  })
  .strict();

/**
 * Resolve a single IDE candidate to a launch result. Tries to spawn the
 * binary detached + unref'd so we don't block the IPC reply; the child's
 * exit fate is intentionally ignored. Returns the IDE token on success,
 * `null` when the binary isn't on PATH (any other spawn error bubbles
 * up).
 */
function spawnIde(
  ide: 'vscode' | 'cursor',
  cwd: string,
): { ok: boolean; error?: string } {
  const bin = ide === 'vscode' ? 'code' : 'cursor';
  try {
    const child = spawn(bin, [cwd], {
      detached: true,
      stdio: 'ignore',
      // On Windows the editor shims live in PATH as `.cmd` files which
      // spawn refuses to launch unless we go through the shell.
      shell: process.platform === 'win32',
    });
    child.on('error', () => {
      // swallow — caller already returned; nothing to surface beyond logs
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Launch an IDE pointed at one of the workspace's repos. Tries the
 * caller-supplied IDE first; if `ide` is omitted (or set to 'system')
 * we fall back to VSCode → Cursor → the host's `revealPath` (Finder /
 * Explorer / xdg-open). Spawn-time errors degrade gracefully — every
 * branch returns a structured result so the renderer can surface the
 * cause without re-throwing.
 */
export async function openRepoInIde(
  deps: HandlerDeps,
  args: { repoId: number; ide?: 'vscode' | 'cursor' | 'system' },
): Promise<{
  ok: boolean;
  ide: 'vscode' | 'cursor' | 'system' | null;
  error?: string;
}> {
  const parsed = parseArgs(openRepoInIdeSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  const repo = requireRepoBelongsTo(deps, workspaceId, parsed.repoId);
  const cwd = repo.repoPath;

  if (parsed.ide === 'vscode' || parsed.ide === 'cursor') {
    const res = spawnIde(parsed.ide, cwd);
    if (res.ok) return { ok: true, ide: parsed.ide };
    return {
      ok: false,
      ide: parsed.ide,
      ...(res.error !== undefined ? { error: res.error } : {}),
    };
  }

  // 'system' or unset → try VSCode, then Cursor, then host reveal.
  const vs = spawnIde('vscode', cwd);
  if (vs.ok) return { ok: true, ide: 'vscode' };
  const cu = spawnIde('cursor', cwd);
  if (cu.ok) return { ok: true, ide: 'cursor' };

  if (deps.revealPath) {
    try {
      await deps.revealPath(cwd);
      return { ok: true, ide: 'system' };
    } catch (err) {
      return {
        ok: false,
        ide: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { ok: false, ide: null, error: 'no IDE on PATH and host has no reveal handler' };
}
