import type {
  AutopilotChildEntry,
  AutopilotChildStatus,
  AutopilotEffort,
  AutopilotPersonaSnapshot,
  AutopilotSession,
} from '@kanbots/local-store';
import type { SuggestFeatureBacklogEntry } from '../bridge.js';
import { collectSuggestionEntries } from '../suggestion-context.js';
import { dispatchAutopilotChild } from './dispatch-helpers.js';
import {
  type OrchestratorContext,
  SessionBudgetExceededError,
  waitForChildSettled,
} from './orchestrator.js';

const MAX_PARALLELISM = 4;
const SLOT_PAUSE_MS = 500;

interface PersonaClaim {
  index: number;
  persona: AutopilotPersonaSnapshot;
}

export async function runFeatureDevLoop(
  ctx: OrchestratorContext,
  initialSession: AutopilotSession,
  signal: AbortSignal,
): Promise<void> {
  if (initialSession.config.kind !== 'feature-dev') {
    throw new Error('feature-dev loop given non-feature-dev session');
  }
  const config = initialSession.config;
  const personas = config.personas;
  if (personas.length === 0) {
    throw new Error('feature-dev autopilot requires at least one persona');
  }

  const parallelism = clampParallelism(config.parallelism);
  const model = config.model;
  const provider = config.provider;
  const effort = config.effort;

  log(`session ${initialSession.id}: starting loop with parallelism=${parallelism}, personas=${personas.length}, provider=${provider ?? 'default'}, model=${model ?? 'default'}, effort=${effort ?? 'medium'}`);

  // Serializes claims of the next persona index so concurrent slots advance
  // cycle_index atomically (single-process JS, so a promise chain is enough).
  let claimLock: Promise<unknown> = Promise.resolve();
  const claimNextPersona = (): Promise<PersonaClaim | null> => {
    const next = claimLock.then(() => doClaim(ctx, initialSession.id, personas));
    claimLock = next.catch(() => undefined);
    return next;
  };

  const slots = Array.from({ length: parallelism }, (_, slotIndex) =>
    runSlot(ctx, initialSession.id, slotIndex, claimNextPersona, model, provider, effort, signal),
  );
  log(`session ${initialSession.id}: ${slots.length} slot(s) launched`);
  await Promise.all(slots);
  log(`session ${initialSession.id}: all slots returned`);
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[autopilot/feature-dev] ${msg}`);
}

function clampParallelism(value: number | undefined): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.min(Math.max(raw, 1), MAX_PARALLELISM);
}

function doClaim(
  ctx: OrchestratorContext,
  sessionId: number,
  personas: AutopilotPersonaSnapshot[],
): PersonaClaim | null {
  const session = ctx.store.autopilotSessions.findById(sessionId);
  if (!session) return null;
  if (session.status !== 'running') return null;
  const index = session.cycleIndex;
  const persona = personas[index % personas.length] as AutopilotPersonaSnapshot;
  const advanced = ctx.store.autopilotSessions.update(sessionId, {
    cycleIndex: index + 1,
  });
  ctx.notify(advanced);
  return { index, persona };
}

async function runSlot(
  ctx: OrchestratorContext,
  sessionId: number,
  slotIndex: number,
  claimNext: () => Promise<PersonaClaim | null>,
  model: string | undefined,
  provider:
    | 'claude-code'
    | 'codex-cli'
    | 'gemini-cli'
    | 'amp-cli'
    | 'cursor-cli'
    | 'copilot-cli'
    | 'opencode-cli'
    | 'droid-cli'
    | 'ccr-cli'
    | 'qwen-cli'
    | 'acp'
    | undefined,
  effort: AutopilotEffort | undefined,
  signal: AbortSignal,
): Promise<void> {
  log(`session ${sessionId}: slot ${slotIndex} entered runSlot`);
  while (!signal.aborted) {
    // If a previous iteration tripped the global Claude API cooldown, wait it
    // out before spawning the next child — otherwise we burn budget retrying
    // straight into the same wall.
    await ctx.supervisor.waitForCooldown(signal);
    if (signal.aborted) return;

    // Enforce the per-session cost budget (if any) before each iteration. We
    // sum total_cost_usd across this session's children. Best-effort: cost
    // only settles when each child completes, so a child can overshoot before
    // we check.
    const preIterSession = ctx.store.autopilotSessions.findById(sessionId);
    if (preIterSession) {
      const budget = ctx.resolveSessionBudget(preIterSession.config);
      if (budget !== null) {
        const childRunIds = preIterSession.children
          .map((c) => c.runId)
          .filter((id): id is number => id !== null);
        const spent = ctx.store.agentRuns.sumCostByIds(childRunIds);
        if (spent >= budget) {
          throw new SessionBudgetExceededError(
            spent,
            budget,
            `cost budget exceeded ($${spent.toFixed(4)} / $${budget.toFixed(2)})`,
          );
        }
      }
    }

    const claim = await claimNext();
    if (!claim) {
      log(`session ${sessionId}: slot ${slotIndex} got null claim — exiting`);
      return;
    }
    log(`session ${sessionId}: slot ${slotIndex} claimed persona "${claim.persona.name}" (idx ${claim.index})`);

    let stepError: Error | null = null;
    try {
      await runOneIteration(ctx, sessionId, slotIndex, claim.persona, model, provider, effort, signal);
    } catch (err) {
      stepError = err instanceof Error ? err : new Error(String(err));
      log(`session ${sessionId}: slot ${slotIndex} iteration error: ${stepError.message}`);
    }

    if (signal.aborted) {
      log(`session ${sessionId}: slot ${slotIndex} aborted after iteration`);
      return;
    }

    if (stepError) {
      // Record a "skipped" entry so the user sees the gap.
      const entry: AutopilotChildEntry = {
        issueNumber: -1,
        runId: null,
        kind: 'feat',
        status: 'skipped',
        createdAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        persona: claim.persona.name,
        title: '(failed to ideate or dispatch)',
        note: stepError.message,
      };
      const withChild = ctx.store.autopilotSessions.appendChild(sessionId, entry);
      ctx.notify(withChild);
    }

    await sleepInterruptible(SLOT_PAUSE_MS, signal);
  }
  log(`session ${sessionId}: slot ${slotIndex} exited (signal aborted)`);
}

async function runOneIteration(
  ctx: OrchestratorContext,
  sessionId: number,
  slotIndex: number,
  persona: AutopilotPersonaSnapshot,
  model: string | undefined,
  provider:
    | 'claude-code'
    | 'codex-cli'
    | 'gemini-cli'
    | 'amp-cli'
    | 'cursor-cli'
    | 'copilot-cli'
    | 'opencode-cli'
    | 'droid-cli'
    | 'ccr-cli'
    | 'qwen-cli'
    | 'acp'
    | undefined,
  effort: AutopilotEffort | undefined,
  signal: AbortSignal,
): Promise<void> {
  const session = ctx.store.autopilotSessions.findById(sessionId);
  if (!session) return;

  log(`session ${sessionId}: slot ${slotIndex} buildSuggestionContext`);
  const backlog = await buildSuggestionContext(ctx);

  log(`session ${sessionId}: slot ${slotIndex} suggestIssue start (persona "${persona.name}")`);
  const draftStart = Date.now();
  ctx.planning.start(sessionId, slotIndex, persona.name);
  const initial = ctx.store.autopilotSessions.findById(sessionId);
  if (initial) ctx.notify(initial);
  let drafted;
  try {
    drafted = await ctx.suggestIssue({
      backlog,
      personaPrompt: persona.prompt,
      onEvent: (event) => {
        ctx.planning.append(sessionId, slotIndex, event);
        const current = ctx.store.autopilotSessions.findById(sessionId);
        if (current) ctx.notify(current);
      },
    });
  } finally {
    ctx.planning.clear(sessionId, slotIndex);
  }
  log(`session ${sessionId}: slot ${slotIndex} suggestIssue done in ${Date.now() - draftStart}ms — "${drafted.title}"`);
  if (signal.aborted) return;

  const issue = await ctx.source.createIssue({
    title: drafted.title,
    body: drafted.body,
    labels: ['type:feat', 'status:in-progress', `parent:${session.issueNumber}`],
  });
  log(`session ${sessionId}: slot ${slotIndex} created issue #${issue.number}`);
  if (signal.aborted) return;

  const thread = ctx.store.threads.getOrCreate({
    repoOwner: ctx.repoConfig.owner,
    repoName: ctx.repoConfig.repo,
    issueNumber: issue.number,
  });

  const dispatchArgs: Parameters<typeof dispatchAutopilotChild>[1] = {
    issue,
    threadId: thread.id,
    personaId: persona.id,
  };
  if (model !== undefined) dispatchArgs.model = model;
  if (provider !== undefined) dispatchArgs.provider = provider;
  if (effort !== undefined) dispatchArgs.effort = effort;

  const run = await dispatchAutopilotChild({ supervisor: ctx.supervisor }, dispatchArgs);
  log(`session ${sessionId}: slot ${slotIndex} dispatched run #${run.id} for issue #${issue.number}`);

  // With parallelism > 1 this represents the most recently started child;
  // active children are derived from `children` (status === 'running') for stop.
  ctx.setCurrentChildRunId(sessionId, run.id);

  const childEntry: AutopilotChildEntry = {
    issueNumber: issue.number,
    runId: run.id,
    kind: 'feat',
    status: 'running',
    createdAt: run.startedAt,
    endedAt: null,
    persona: persona.name,
    title: drafted.title,
  };
  const withChild = ctx.store.autopilotSessions.appendChild(sessionId, childEntry);
  ctx.notify(withChild);

  const settled = await waitForChildSettled(ctx.supervisor, ctx.store, run.id, signal);
  const childStatus: AutopilotChildStatus =
    settled.dismissedDecision && settled.finalStatus === 'awaiting_input'
      ? 'skipped'
      : settled.finalStatus;
  log(`session ${sessionId}: slot ${slotIndex} child run #${run.id} settled as ${childStatus}`);
  const updated = ctx.store.autopilotSessions.updateChildByIssueNumber(
    sessionId,
    issue.number,
    {
      status: childStatus,
      endedAt: new Date().toISOString(),
    },
  );
  ctx.notify(updated);
}

async function buildSuggestionContext(
  ctx: OrchestratorContext,
): Promise<SuggestFeatureBacklogEntry[]> {
  const all = await ctx.source.listIssues({ state: 'all' });
  return collectSuggestionEntries(all);
}

function sleepInterruptible(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
