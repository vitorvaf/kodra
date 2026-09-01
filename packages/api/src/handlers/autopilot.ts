import type { AutopilotConfig, AutopilotSession } from '@kanbots/local-store';
import { z } from 'zod';
import { badRequest, parseArgs } from './errors.js';
import type { HandlerDeps } from './types.js';

const personaSnapshotSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    prompt: z.string().min(1),
  })
  .strict();

const checkCommandSchema = z
  .object({
    kind: z.enum(['typecheck', 'tests', 'lint', 'build', 'e2e']),
    command: z.string().min(1),
    args: z.array(z.string()),
  })
  .strict();

const effortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);

const featureDevConfigSchema = z
  .object({
    kind: z.literal('feature-dev'),
    personas: z.array(personaSnapshotSchema).min(1).max(20),
    model: z.string().min(1).max(120).optional(),
    provider: z
      .enum([
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
      ])
      .optional(),
    effort: effortSchema.optional(),
    parallelism: z.number().int().min(1).max(4).optional(),
    sessionCostBudgetUsd: z.number().positive().optional(),
  })
  .strict();

const qaConfigSchema = z
  .object({
    kind: z.literal('qa'),
    checks: z.array(checkCommandSchema),
    liveUi: z.boolean(),
    devServer: z
      .object({ command: z.string().min(1), args: z.array(z.string()) })
      .strict()
      .optional(),
    sessionCostBudgetUsd: z.number().positive().optional(),
  })
  .strict()
  .refine((c) => c.checks.length > 0 || c.liveUi, {
    message: 'qa autopilot needs at least one check or liveUi=true',
  });

const startSchema = z
  .object({
    kind: z.enum(['feature-dev', 'qa']),
    title: z.string().min(1).max(200).optional(),
    config: z.union([featureDevConfigSchema, qaConfigSchema]),
  })
  .strict()
  .refine((s) => s.kind === s.config.kind, {
    message: 'kind and config.kind must match',
    path: ['config', 'kind'],
  });

const stopSchema = z
  .object({
    sessionId: z.number().int().positive(),
    stopChildren: z.boolean(),
  })
  .strict();

const getByIssueSchema = z
  .object({ issueNumber: z.number().int().positive() })
  .strict();

export interface StartArgs {
  kind: 'feature-dev' | 'qa';
  title?: string;
  config: AutopilotConfig;
}

export async function start(
  deps: HandlerDeps,
  args: StartArgs,
): Promise<{ sessionId: number; issueNumber: number }> {
  const parsed = parseArgs(startSchema, args);
  if (parsed.kind === 'qa') {
    throw badRequest(
      'QA autopilot ships in a follow-up release. Use Feature Dev for now.',
    );
  }
  const startInput: Parameters<HandlerDeps['autopilot']['start']>[0] = {
    kind: parsed.kind,
    config: parsed.config as AutopilotConfig,
  };
  if (parsed.title !== undefined) startInput.title = parsed.title;
  const result = await deps.autopilot.start(startInput);
  return { sessionId: result.session.id, issueNumber: result.issueNumber };
}

export interface StopArgs {
  sessionId: number;
  stopChildren: boolean;
}

export async function stop(
  deps: HandlerDeps,
  args: StopArgs,
): Promise<{ sessionId: number }> {
  const parsed = parseArgs(stopSchema, args);
  await deps.autopilot.stop(parsed.sessionId, { stopChildren: parsed.stopChildren });
  return { sessionId: parsed.sessionId };
}

export async function listActive(deps: HandlerDeps): Promise<AutopilotSession[]> {
  return deps.autopilot.listActive();
}

export interface GetByIssueArgs {
  issueNumber: number;
}

export async function getByIssue(
  deps: HandlerDeps,
  args: GetByIssueArgs,
): Promise<AutopilotSession | null> {
  const parsed = parseArgs(getByIssueSchema, args);
  return deps.autopilot.getSessionByIssue(parsed.issueNumber);
}
