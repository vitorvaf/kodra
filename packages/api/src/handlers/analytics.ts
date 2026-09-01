import { z } from 'zod';
import type { RecentActivityKind, RecentActivityPayload } from '../bridge.js';
import { parseArgs } from './errors.js';
import type { HandlerDeps } from './types.js';

const repoFilter = {
  repoOwner: z.string().min(1).optional(),
  repoName: z.string().min(1).optional(),
} as const;

const rollupSchema = z
  .object({
    ...repoFilter,
    sinceTs: z.string().datetime().optional(),
    cardKind: z.string().optional(),
    cardSizeBucket: z.string().optional(),
  })
  .strict();

const timeSeriesSchema = z
  .object({
    ...repoFilter,
    sinceTs: z.string().datetime(),
    personaId: z.string().optional(),
    model: z.string().optional(),
  })
  .strict();

const frontierSchema = z
  .object({
    ...repoFilter,
    sinceTs: z.string().datetime().optional(),
    minRuns: z.number().int().positive().max(100).optional(),
  })
  .strict();

export type RollupArgs = z.infer<typeof rollupSchema>;
export type TimeSeriesArgs = z.infer<typeof timeSeriesSchema>;
export type FrontierArgs = z.infer<typeof frontierSchema>;

export interface PersonaModelRollupRow {
  personaId: string;
  model: string | null;
  provider: string | null;
  runs: number;
  successes: number;
  failures: number;
  totalCostUsd: number;
  avgCostUsd: number;
  avgDurationMs: number | null;
  successRate: number;
}

export interface CostTimeSeriesPoint {
  bucketDate: string;
  runs: number;
  totalCostUsd: number;
  successRate: number;
}

export interface FrontierPoint {
  personaId: string;
  model: string | null;
  provider: string | null;
  runs: number;
  avgCostUsd: number;
  successRate: number;
}

function buildRollupOpts(parsed: RollupArgs): Parameters<
  HandlerDeps['store']['agentRuns']['personaModelRollup']
>[0] {
  const opts: Parameters<HandlerDeps['store']['agentRuns']['personaModelRollup']>[0] = {};
  if (parsed.repoOwner !== undefined) opts.repoOwner = parsed.repoOwner;
  if (parsed.repoName !== undefined) opts.repoName = parsed.repoName;
  if (parsed.sinceTs !== undefined) opts.sinceTs = parsed.sinceTs;
  if (parsed.cardKind !== undefined) opts.cardKind = parsed.cardKind;
  if (parsed.cardSizeBucket !== undefined) opts.cardSizeBucket = parsed.cardSizeBucket;
  return opts;
}

export async function rollup(
  deps: HandlerDeps,
  args: RollupArgs,
): Promise<PersonaModelRollupRow[]> {
  const parsed = parseArgs(rollupSchema, args);
  return deps.store.agentRuns.personaModelRollup(buildRollupOpts(parsed));
}

export async function timeSeries(
  deps: HandlerDeps,
  args: TimeSeriesArgs,
): Promise<CostTimeSeriesPoint[]> {
  const parsed = parseArgs(timeSeriesSchema, args);
  const opts: Parameters<HandlerDeps['store']['agentRuns']['costTimeSeries']>[0] = {
    sinceTs: parsed.sinceTs,
  };
  if (parsed.repoOwner !== undefined) opts.repoOwner = parsed.repoOwner;
  if (parsed.repoName !== undefined) opts.repoName = parsed.repoName;
  if (parsed.personaId !== undefined) opts.personaId = parsed.personaId;
  if (parsed.model !== undefined) opts.model = parsed.model;
  return deps.store.agentRuns.costTimeSeries(opts);
}

export async function frontier(
  deps: HandlerDeps,
  args: FrontierArgs,
): Promise<FrontierPoint[]> {
  const parsed = parseArgs(frontierSchema, args);
  const opts: Parameters<HandlerDeps['store']['agentRuns']['frontierData']>[0] = {};
  if (parsed.repoOwner !== undefined) opts.repoOwner = parsed.repoOwner;
  if (parsed.repoName !== undefined) opts.repoName = parsed.repoName;
  if (parsed.sinceTs !== undefined) opts.sinceTs = parsed.sinceTs;
  if (parsed.minRuns !== undefined) opts.minRuns = parsed.minRuns;
  return deps.store.agentRuns.frontierData(opts);
}

const recentActivitySchema = z
  .object({
    limit: z.number().int().positive().max(64).optional(),
  })
  .strict();

export type RecentActivityArgs = z.infer<typeof recentActivitySchema>;

/**
 * Coarse classification + one-line summary for a persisted agent_event.
 * Stays pure (no I/O) so the rail can render the row exactly as stored,
 * even if the underlying run later finishes. Payload sniffing is
 * defensive — agent_event.payload is `unknown` at the type level.
 */
function classifyEvent(
  type: string,
  payload: unknown,
  runStatus: string,
): { kind: RecentActivityKind; summary: string } {
  if (type === 'tool_use') {
    const p = payload as { name?: unknown; input?: unknown } | null;
    const toolName =
      p && typeof p.name === 'string' && p.name.length > 0 ? p.name : 'Tool';
    // Pull a useful one-arg tail when present so the row shows
    // "Edit src/api.ts" instead of just "Edit".
    let arg: string | null = null;
    if (p && p.input !== null && typeof p.input === 'object') {
      const input = p.input as Record<string, unknown>;
      const candidates = [
        'file_path',
        'path',
        'command',
        'query',
        'pattern',
        'url',
        'description',
      ];
      for (const key of candidates) {
        const v = input[key];
        if (typeof v === 'string' && v.length > 0) {
          arg = v.length > 40 ? `…${v.slice(-39)}` : v;
          break;
        }
      }
    }
    return { kind: 'tool_use', summary: arg ? `${toolName} ${arg}` : toolName };
  }
  if (type === 'tool_result') {
    return { kind: 'tool_result', summary: 'Tool result' };
  }
  if (type === 'error') {
    const p = payload as { message?: unknown } | null;
    const msg = p && typeof p.message === 'string' ? p.message : 'Error';
    return { kind: 'error', summary: msg.length > 60 ? `${msg.slice(0, 59)}…` : msg };
  }
  if (type === 'containment_warning') {
    return { kind: 'error', summary: 'Containment warning' };
  }
  // text / unknown
  if (runStatus === 'awaiting_input') {
    return { kind: 'decision', summary: 'Awaiting decision' };
  }
  if (runStatus === 'completed') {
    return { kind: 'completed', summary: 'Completed' };
  }
  if (runStatus === 'failed') {
    return { kind: 'error', summary: 'Run failed' };
  }
  if (runStatus === 'running' || runStatus === 'spawning') {
    return { kind: 'started', summary: 'Working' };
  }
  return { kind: 'text', summary: 'Update' };
}

export async function recentActivity(
  deps: HandlerDeps,
  args: RecentActivityArgs,
): Promise<RecentActivityPayload[]> {
  const parsed = parseArgs(recentActivitySchema, args);
  const limit = parsed.limit ?? 8;
  const rows = deps.store.events.listRecentAcrossWorkspace(limit);
  return rows.map((row) => {
    const { kind, summary } = classifyEvent(row.type, row.payload, row.runStatus);
    return {
      id: row.id,
      agentRunId: row.agentRunId,
      issueNumber: row.issueNumber,
      kind,
      summary,
      createdAt: row.createdAt,
    };
  });
}
