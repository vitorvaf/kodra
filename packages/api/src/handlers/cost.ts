import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CostTodayResult, CostUsageResult, CostUsageWindow, CostBreakdownItem } from '../bridge.js';
import type { HandlerDeps } from './types.js';

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function today(deps: HandlerDeps): Promise<CostTodayResult> {
  const since = startOfTodayIso();
  const totalUsd = deps.store.agentRuns.sumCostSince(since);
  return { totalUsd, since };
}

export async function breakdown(deps: HandlerDeps): Promise<CostBreakdownItem[]> {
  return deps.store.agentRuns.sumCostByWorkspaceAndProvider();
}

// Same data Claude Code's statusLine shows under `rate_limits.{five_hour,seven_day}`.
// Lives at https://api.anthropic.com/api/oauth/usage and is keyed off the user's
// claude.ai OAuth token, which Claude Code persists in ~/.claude/.credentials.json.
const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const USAGE_BETA_HEADER = 'oauth-2025-04-20';
const USAGE_CACHE_MS = 60_000;

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    subscriptionType?: string;
  };
}

interface OauthUsageResponse {
  five_hour?: { utilization?: number; resets_at?: string } | null;
  seven_day?: { utilization?: number; resets_at?: string } | null;
}

interface UsageCacheEntry {
  expiresAt: number;
  payload: CostUsageResult;
}
let usageCache: UsageCacheEntry | null = null;

export async function usage(_deps: HandlerDeps): Promise<CostUsageResult> {
  void _deps;
  const now = Date.now();
  if (usageCache && usageCache.expiresAt > now) return usageCache.payload;

  const empty: CostUsageResult = { fiveHour: null, sevenDay: null, source: 'unavailable' };
  const token = await readOauthToken();
  if (!token) {
    return empty;
  }

  try {
    const res = await fetch(USAGE_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': USAGE_BETA_HEADER,
        accept: 'application/json',
      },
    });
    if (!res.ok) {
      // 401 most likely means the access token expired; ask the user to relog.
      const reason: CostUsageResult['source'] =
        res.status === 401 ? 'unauthorized' : 'unavailable';
      const fallback: CostUsageResult = { fiveHour: null, sevenDay: null, source: reason };
      // Brief cache so a flapping endpoint doesn't get hammered.
      usageCache = { expiresAt: now + 10_000, payload: fallback };
      return fallback;
    }
    const data = (await res.json()) as OauthUsageResponse;
    const payload: CostUsageResult = {
      fiveHour: toWindow(data.five_hour),
      sevenDay: toWindow(data.seven_day),
      source: 'oauth',
    };
    usageCache = { expiresAt: now + USAGE_CACHE_MS, payload };
    return payload;
  } catch {
    const fallback: CostUsageResult = { fiveHour: null, sevenDay: null, source: 'unavailable' };
    usageCache = { expiresAt: now + 10_000, payload: fallback };
    return fallback;
  }
}

function toWindow(raw: OauthUsageResponse['five_hour']): CostUsageWindow | null {
  if (!raw) return null;
  const utilization = typeof raw.utilization === 'number' ? raw.utilization : null;
  if (utilization === null) return null;
  return {
    pct: Math.max(0, Math.min(1, utilization / 100)),
    resetsAt: typeof raw.resets_at === 'string' ? raw.resets_at : null,
  };
}

async function readOauthToken(): Promise<string | null> {
  const path = join(homedir(), '.claude', '.credentials.json');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ClaudeCredentials;
    const oauth = parsed.claudeAiOauth;
    if (!oauth) return null;
    if (typeof oauth.accessToken !== 'string') return null;
    return oauth.accessToken;
  } catch {
    return null;
  }
}
