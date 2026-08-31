import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import type { Issue, IssueRef } from '@kanbots/core';
import { removeWorktree, type AgentRunProvider } from '@kanbots/dispatcher';
import type { AgentRun, Store } from '@kanbots/local-store';
import { z } from 'zod';
import type { DecoratedIssue, SplitResult } from '../bridge.js';
import { buildActiveRunMap, decorateIssue } from './issues.js';
import { badRequest, parseArgs } from './errors.js';
import { issueRefSchema } from '../issue-ref.js';
import { hasProviderCredentials, resolveProviderWithCreds } from './provider-credentials.js';
import type { HandlerDeps } from './types.js';

const execFileAsync = promisify(execFile);

const REVIEWER_SYSTEM_PROMPT = `You are a code reviewer for a kodra task.

Your job is to read the diff already in this worktree and produce a focused review.

1. Run \`git diff\` to read the changes.
2. Read the linked issue body (the user's prompt has it).
3. Identify: bugs, missed edge cases, places where the change diverges from the
   issue's acceptance criteria, opportunities to simplify.
4. Emit your review as a single text response. Do NOT modify code. Do NOT
   commit. Do NOT spawn checks.
5. End your turn after the review.`;

const PROVIDER_ENUM = z.enum([
  'claude-code',
  'codex-cli',
  'gemini-cli',
  'agy-cli',
  'amp-cli',
  'cursor-cli',
  'copilot-cli',
  'opencode-cli',
  'droid-cli',
  'ccr-cli',
  'qwen-cli',
  'acp',
]);

type DispatchProvider = AgentRunProvider;

function resolveDispatchProvider(
  deps: HandlerDeps,
  explicit: DispatchProvider | undefined,
): DispatchProvider {
  let defaultProvider: DispatchProvider | undefined;
  try {
    const configured = deps.store.providerSettings.get().defaultProvider;
    if (PROVIDER_ENUM.safeParse(configured).success) {
      defaultProvider = configured as DispatchProvider;
    }
  } catch {
    // Settings may not exist on first run; fall through to credential-aware
    // resolution below.
  }
  const hasCreds = (id: DispatchProvider) =>
    hasProviderCredentials(id, () => deps.providers.hasClaudeCodeCredentials());
  return resolveProviderWithCreds(explicit, defaultProvider, hasCreds);
}

const startAgentSchema = z
  .object({
    number: issueRefSchema,
    threadId: z.number().int().positive(),
    prompt: z.string().min(1).max(20_000),
    appendSystemPrompt: z.string().max(20_000).optional(),
    model: z.string().min(1).max(120).optional(),
    provider: PROVIDER_ENUM.optional(),
    repoId: z.number().int().positive().optional(),
  })
  .strict();

const issueNumberSchema = z
  .object({
    number: issueRefSchema,
  })
  .strict();

const splitSchema = z
  .object({
    number: issueRefSchema,
    subtasks: z
      .array(
        z
          .object({
            title: z.string().min(1).max(200),
            body: z.string().max(20_000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    dispatch: z.boolean().optional(),
    repoId: z.number().int().positive().optional(),
  })
  .strict();

const reviewerSchema = z
  .object({
    number: issueRefSchema,
    threadId: z.number().int().positive().optional(),
    prompt: z.string().min(1).max(20_000).optional(),
    model: z.string().min(1).max(120).optional(),
    repoId: z.number().int().positive().optional(),
  })
  .strict();

const prRequestChangesSchema = z
  .object({
    number: issueRefSchema,
    body: z.string().max(65_536).optional(),
  })
  .strict();

export interface StartAgentArgs {
  number: IssueRef;
  threadId: number;
  prompt: string;
  appendSystemPrompt?: string;
  model?: string;
  provider?:
    | 'claude-code'
    | 'codex-cli'
    | 'gemini-cli'
    | 'agy-cli'
    | 'amp-cli'
    | 'cursor-cli'
    | 'copilot-cli'
    | 'opencode-cli'
    | 'droid-cli'
    | 'ccr-cli'
    | 'qwen-cli'
    | 'acp';
  repoId?: number;
}

export interface NumberArgs {
  number: IssueRef;
}

export interface SplitArgs {
  number: IssueRef;
  subtasks: Array<{ title: string; body?: string }>;
  dispatch?: boolean;
  repoId?: number;
}

export interface ReviewerArgs {
  number: IssueRef;
  threadId?: number;
  prompt?: string;
  model?: string;
  repoId?: number;
}

export interface PrRequestChangesArgs {
  number: IssueRef;
  body?: string;
}

export async function startAgent(
  deps: HandlerDeps,
  args: StartAgentArgs,
): Promise<AgentRun> {
  const parsed = parseArgs(startAgentSchema, args);
  const dispatchProvider = resolveDispatchProvider(deps, parsed.provider);
  let toolPrep: Awaited<ReturnType<NonNullable<typeof deps.chatTools>['prepareForRun']>> | null = null;
  if (deps.chatTools) {
    try {
      toolPrep = await deps.chatTools.prepareForRun({ provider: dispatchProvider });
    } catch {
      toolPrep = null;
    }
  }
  try {
    return await deps.supervisor.start({
      threadId: parsed.threadId,
      issueNumber: parsed.number,
      prompt: parsed.prompt,
      ...(parsed.appendSystemPrompt !== undefined
        ? { appendSystemPrompt: parsed.appendSystemPrompt }
        : {}),
      ...(parsed.model !== undefined ? { model: parsed.model } : {}),
      ...(parsed.provider !== undefined ? { provider: parsed.provider } : {}),
      ...(parsed.repoId !== undefined ? { repoId: parsed.repoId } : {}),
      ...(toolPrep
        ? {
            extraArgs: toolPrep.extraArgs,
            env: toolPrep.env,
            cleanup: toolPrep.cleanup,
          }
        : {}),
    });
  } catch (err) {
    if (toolPrep) toolPrep.cleanup();
    throw err;
  }
}

export async function archive(
  deps: HandlerDeps,
  args: NumberArgs,
): Promise<DecoratedIssue> {
  const parsed = parseArgs(issueNumberSchema, args);
  const issue = await deps.source.getIssue(parsed.number);

  // If this is an autopilot parent, stop its session so the orchestrator loop
  // exits cleanly before we close the issue. Children are left as-is — the
  // user can archive them individually if desired.
  if (issue.labels.includes('type:autopilot')) {
    const session = deps.autopilot.getSessionByIssue(parsed.number);
    if (session && session.status === 'running') {
      await deps.autopilot.stop(session.id, { stopChildren: false });
    }
  }

  const thread = findThreadForIssue(deps.store, parsed.number);
  if (thread) {
    const runs = deps.store.agentRuns
      .listByThread(thread.id)
      .filter(
        (r) =>
          r.status === 'starting' ||
          r.status === 'running' ||
          r.status === 'awaiting_input',
      );
    for (const run of runs) {
      await deps.supervisor.stop(run.id);
    }
  }
  const labels = issue.labels.filter(
    (l) =>
      !l.startsWith('status:') && !l.startsWith('agent:') && l !== 'archived',
  );
  labels.push('archived');
  const updated = await deps.source.updateIssue(parsed.number, {
    labels,
    state: 'closed',
  });
  return decorateIssue(updated);
}

export async function unarchive(
  deps: HandlerDeps,
  args: NumberArgs,
): Promise<DecoratedIssue> {
  const parsed = parseArgs(issueNumberSchema, args);
  const issue = await deps.source.getIssue(parsed.number);
  // Drop the 'archived' marker, keep all other labels, and restore a sensible
  // status so the card appears on the board instead of falling into Inbox.
  const stripped = issue.labels.filter(
    (l) => l !== 'archived' && !l.startsWith('status:'),
  );
  const labels = [...stripped, 'status:backlog'];
  const updated = await deps.source.updateIssue(parsed.number, {
    labels,
    state: 'open',
  });
  return decorateIssue(updated);
}

export async function approve(
  deps: HandlerDeps,
  args: NumberArgs,
): Promise<DecoratedIssue> {
  const parsed = parseArgs(issueNumberSchema, args);
  const issue = await deps.source.getIssue(parsed.number);
  const labels = issue.labels.filter(
    (l) => !l.startsWith('status:') && !l.startsWith('agent:'),
  );
  labels.push('status:done', 'agent:idle');
  const updated = await deps.source.updateIssue(parsed.number, {
    labels,
    state: 'closed',
  });
  return decorateIssue(updated);
}

export async function prApprove(
  deps: HandlerDeps,
  args: NumberArgs,
): Promise<DecoratedIssue> {
  const parsed = parseArgs(issueNumberSchema, args);
  const issue = await deps.source.getIssue(parsed.number);
  const pull = await findPullForIssueBranch(deps, parsed.number);
  if (
    pull !== null &&
    typeof deps.source.approvePullRequest === 'function'
  ) {
    await deps.source.approvePullRequest({
      pullNumber: pull.number,
      body: 'Approved via Kodra.',
    });
  }
  return updateApprovedIssue(deps, issue);
}

export async function requestChanges(
  deps: HandlerDeps,
  args: NumberArgs,
): Promise<DecoratedIssue> {
  const parsed = parseArgs(issueNumberSchema, args);
  const issue = await deps.source.getIssue(parsed.number);
  const labels = issue.labels.filter(
    (l) => !l.startsWith('status:') && !l.startsWith('agent:'),
  );
  labels.push('status:in-progress', 'agent:blocked');
  const updated = await deps.source.updateIssue(parsed.number, { labels });
  return decorateIssue(updated);
}

export async function prRequestChanges(
  deps: HandlerDeps,
  args: PrRequestChangesArgs,
): Promise<DecoratedIssue> {
  const parsed = parseArgs(prRequestChangesSchema, args);
  const issue = await deps.source.getIssue(parsed.number);
  const pull = await findPullForIssueBranch(deps, parsed.number);
  if (
    pull !== null &&
    typeof deps.source.requestChangesPullRequest === 'function'
  ) {
    await deps.source.requestChangesPullRequest({
      pullNumber: pull.number,
      body: parsed.body ?? 'Changes requested via Kodra.',
    });
  }
  return updateRequestedChangesIssue(deps, issue);
}

export async function split(
  deps: HandlerDeps,
  args: SplitArgs,
): Promise<SplitResult> {
  const parsed = parseArgs(splitSchema, args);
  const parent = await deps.source.getIssue(parsed.number);
  const labels = (parent.labels ?? []).filter(
    (l) => !l.startsWith('status:') && !l.startsWith('agent:'),
  );
  const created: Issue[] = [];
  for (const sub of parsed.subtasks) {
    const child = await deps.source.createIssue({
      title: sub.title,
      ...(sub.body !== undefined ? { body: sub.body } : {}),
      labels: [...labels, 'status:backlog', `parent:${parsed.number}`],
    });
    created.push(child);
    if (parsed.dispatch) {
      const thread = ensureThread(deps.store, child.number);
      deps.store.messages.create({
        threadId: thread.id,
        role: 'user',
        body: sub.body ?? sub.title,
      });
      try {
        await deps.supervisor.start({
          threadId: thread.id,
          issueNumber: child.number,
          prompt: sub.body ?? sub.title,
          ...(parsed.repoId !== undefined ? { repoId: parsed.repoId } : {}),
        });
      } catch {
        // Surfaced via run rows; child issue still created.
      }
    }
  }
  const activeRunMap = buildActiveRunMap(deps);
  const decoratedChildren = created.map((c) =>
    decorateIssue(c, activeRunMap.get(c.number) ?? null),
  );
  return { parent: parsed.number, children: decoratedChildren };
}

export async function reviewer(
  deps: HandlerDeps,
  args: ReviewerArgs,
): Promise<AgentRun> {
  const parsed = parseArgs(reviewerSchema, args);
  const issue = await deps.source.getIssue(parsed.number);
  let threadId = parsed.threadId;
  if (threadId === undefined) {
    const existingThread = findThreadForIssue(deps.store, parsed.number);
    if (existingThread) {
      threadId = existingThread.id;
    } else {
      throw badRequest(
        'no thread for this issue yet — send a message first or pass threadId explicitly',
      );
    }
  }
  const reviewerPrompt =
    parsed.prompt ??
    `Review the implementation against the issue:\n\n${issue.title}\n\n${issue.body ?? ''}`;
  const runs = deps.store.agentRuns.listByThread(threadId);
  const sourceRun = [...runs].reverse().find(
    (run) => run.worktreePath !== null && run.branchName !== null,
  );
  let reviewWorktreePath: string | undefined;
  if (sourceRun?.worktreePath && sourceRun.branchName) {
    const { stdout: headSha } = await execFileAsync(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd: sourceRun.worktreePath },
    );
    const stamp = Date.now().toString(36);
    reviewWorktreePath = `${sourceRun.worktreePath}-review-${stamp}`;
    await mkdir(dirname(reviewWorktreePath), { recursive: true });
    await execFileAsync(
      'git',
      ['worktree', 'add', '--detach', reviewWorktreePath, headSha.trim()],
      { cwd: sourceRun.worktreePath },
    );
  }
  return deps.supervisor.start({
    threadId,
    issueNumber: parsed.number,
    prompt: reviewerPrompt,
    appendSystemPrompt: REVIEWER_SYSTEM_PROMPT,
    ...(parsed.model ? { model: parsed.model } : {}),
    ...(parsed.repoId !== undefined ? { repoId: parsed.repoId } : {}),
    ...(reviewWorktreePath !== undefined
      ? {
          worktreePath: reviewWorktreePath,
          cleanup: () => {
            void removeWorktree({
              repoPath: sourceRun!.worktreePath!,
              worktreePath: reviewWorktreePath!,
              force: true,
            }).catch(() => undefined);
          },
        }
      : {}),
  });
}

async function findPullForIssueBranch(
  deps: HandlerDeps,
  issueNumber: IssueRef,
): Promise<{ number: number } | null> {
  const findOpenPull = deps.source.findOpenPullForBranch;
  if (typeof findOpenPull !== 'function') return null;
  const thread = findThreadForIssue(deps.store, issueNumber);
  if (!thread) return null;
  const runs = deps.store.agentRuns.listByThread(thread.id);
  const branch = runs[runs.length - 1]?.branchName;
  if (!branch) return null;
  try {
    return await findOpenPull.call(deps.source, branch);
  } catch {
    return null;
  }
}

async function updateApprovedIssue(
  deps: HandlerDeps,
  issue: Issue,
): Promise<DecoratedIssue> {
  const labels = issue.labels.filter(
    (l) => !l.startsWith('status:') && !l.startsWith('agent:'),
  );
  labels.push('status:done', 'agent:idle');
  const updated = await deps.source.updateIssue(issue.number, {
    labels,
    state: 'closed',
  });
  return decorateIssue(updated);
}

async function updateRequestedChangesIssue(
  deps: HandlerDeps,
  issue: Issue,
): Promise<DecoratedIssue> {
  const labels = issue.labels.filter(
    (l) => !l.startsWith('status:') && !l.startsWith('agent:'),
  );
  labels.push('status:in-progress', 'agent:blocked');
  const updated = await deps.source.updateIssue(issue.number, { labels });
  return decorateIssue(updated);
}

function findThreadForIssue(
  store: Store,
  issueNumber: IssueRef,
): { id: number; issueNumber: IssueRef } | null {
  const all = store.threads.list();
  return all.find((t) => t.issueNumber === issueNumber) ?? null;
}

function ensureThread(store: Store, issueNumber: IssueRef): { id: number } {
  const existing = findThreadForIssue(store, issueNumber);
  if (existing) return { id: existing.id };
  return store.threads.create({
    repoOwner: 'local',
    repoName: 'split',
    issueNumber,
  });
}
