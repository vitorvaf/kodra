import {
  resolveCheckCommand,
  runCheck,
  type CheckCommand,
  type CheckCommandOverrides,
  type CheckResult,
} from '@kanbots/dispatcher';
import {
  readWorkspaceConfig,
  type AgentCheck,
  type CheckKind,
  type Store,
} from '@kanbots/local-store';
import { z } from 'zod';
import { badRequest, notFound, parseArgs } from './errors.js';
import type { HandlerDeps } from './types.js';

const listSchema = z
  .object({
    runId: z.number().int().positive(),
  })
  .strict();

const runSchema = z
  .object({
    runId: z.number().int().positive(),
    kinds: z.array(z.enum(['typecheck', 'tests', 'lint', 'e2e'])).optional(),
  })
  .strict();

export interface ListChecksArgs {
  runId: number;
}

export interface RunChecksArgs {
  runId: number;
  kinds?: CheckKind[];
}

export type RunCheckImpl = (options: {
  cwd: string;
  command: CheckCommand;
}) => Promise<CheckResult>;

const inFlight = new Map<number, Set<CheckKind>>();

export async function list(
  deps: HandlerDeps,
  args: ListChecksArgs,
): Promise<AgentCheck[]> {
  const parsed = parseArgs(listSchema, args);
  return deps.store.checks.listLatestByRun(parsed.runId);
}

export interface RunChecksDeps extends HandlerDeps {
  runCheckImpl?: RunCheckImpl;
}

export async function runChecks(
  deps: RunChecksDeps,
  args: RunChecksArgs,
): Promise<AgentCheck[]> {
  const parsed = parseArgs(runSchema, args);
  const run = deps.store.agentRuns.findById(parsed.runId);
  if (!run) throw notFound(`agent run ${parsed.runId} not found`);
  if (!run.worktreePath) throw badRequest('run has no worktree');

  const runImpl: RunCheckImpl =
    deps.runCheckImpl ??
    ((opts) => runCheck({ cwd: opts.cwd, command: opts.command }));

  const kinds: CheckKind[] = parsed.kinds ?? ['typecheck', 'tests', 'lint'];
  const queued = inFlight.get(parsed.runId) ?? new Set<CheckKind>();
  inFlight.set(parsed.runId, queued);

  const started = kinds
    .filter((kind) => !queued.has(kind))
    .map((kind) => deps.store.checks.start({ agentRunId: parsed.runId, kind }));
  for (const kind of kinds) queued.add(kind);

  const overrides = await loadCheckOverrides(deps);
  const cwd = run.worktreePath;
  for (const checkRow of started) {
    const command = resolveCheckCommand(checkRow.kind, overrides);
    void runImpl({ cwd, command })
      .then((result) => {
        finishCheck(deps.store, checkRow.id, result.status, result.summary);
      })
      .catch((err: unknown) => {
        finishCheck(
          deps.store,
          checkRow.id,
          'fail',
          err instanceof Error ? err.message : String(err),
        );
      })
      .finally(() => {
        queued.delete(checkRow.kind);
      });
  }

  return started;
}

function finishCheck(
  store: Store,
  id: number,
  status: 'pass' | 'fail',
  summary: string,
): void {
  const check = store.checks.finish({ id, status, summary });
  // A failed check downgrades a clean completion. Monotonic upgrade ordering
  // means `failed`/`stopped`/`promoted` are unaffected by this — only a run
  // sitting at `completed_clean` flips to `completed_with_failed_checks`.
  if (status === 'fail') {
    const run = store.agentRuns.findById(check.agentRunId);
    if (run && run.successSignal === 'completed_clean') {
      store.agentRuns.update(check.agentRunId, {
        successSignal: 'completed_with_failed_checks',
      });
    }
  }
}

async function loadCheckOverrides(deps: HandlerDeps): Promise<CheckCommandOverrides | undefined> {
  if (!deps.config.repoPath) return undefined;
  try {
    const cfg = await readWorkspaceConfig(deps.config.repoPath);
    return cfg?.checks;
  } catch {
    return undefined;
  }
}

export type ResolvedCheckCommands = Record<CheckKind, { command: string; args: string[] }>;

export async function commands(deps: HandlerDeps): Promise<ResolvedCheckCommands> {
  const overrides = await loadCheckOverrides(deps);
  const kinds: CheckKind[] = ['typecheck', 'tests', 'lint', 'e2e'];
  const out = {} as ResolvedCheckCommands;
  for (const kind of kinds) {
    const c = resolveCheckCommand(kind, overrides);
    out[kind] = { command: c.command, args: c.args };
  }
  return out;
}
