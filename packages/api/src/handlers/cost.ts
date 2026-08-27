import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  AgentUsageResult,
  CostBreakdownItem,
  CostTodayResult,
  CostUsageResult,
  UsageWindowInfo,
} from '../bridge.js';
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

type UsageFetch = typeof fetch;

const CLAUDE_PROVIDER = 'claude-code';
const CODEX_PROVIDER = 'codex-cli';
const AGY_PROVIDER = 'agy-cli';
const COPILOT_PROVIDER = 'copilot-cli';
const USAGE_CACHE_MS = 60_000;
const FAILURE_CACHE_MS = 10_000;

let usageFetch: UsageFetch = (...args) => globalThis.fetch(...args);

/** Test seam for the provider HTTP calls. Passing null restores global fetch. */
export function setUsageFetch(fetcher: UsageFetch | null): void {
  usageFetch = fetcher ?? ((...args) => globalThis.fetch(...args));
  resetUsageCaches();
}

class UsageHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Usage request failed with status ${status}`);
    this.name = 'UsageHttpError';
    this.status = status;
  }
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await usageFetch(url, init);
  if (!response.ok) throw new UsageHttpError(response.status);
  return response.json();
}

interface UsageCacheEntry {
  expiresAt: number;
  payload: AgentUsageResult;
}

let claudeCache: UsageCacheEntry | null = null;
let codexCache: UsageCacheEntry | null = null;
let agyCache: UsageCacheEntry | null = null;
let copilotCache: UsageCacheEntry | null = null;

export function resetUsageCaches(): void {
  claudeCache = null;
  codexCache = null;
  agyCache = null;
  copilotCache = null;
  resetAntigravityTokenMemo();
}

function cached(
  cache: UsageCacheEntry | null,
  now: number,
): AgentUsageResult | null {
  return cache && cache.expiresAt > now ? cache.payload : null;
}

function saveCache(
  payload: AgentUsageResult,
  now: number,
  success: boolean,
): UsageCacheEntry {
  return {
    expiresAt: now + (success ? USAGE_CACHE_MS : FAILURE_CACHE_MS),
    payload,
  };
}

function unavailable(provider: string, source: AgentUsageResult['source'] = 'unavailable'):
  AgentUsageResult {
  return { provider, source, windows: [] };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ---------------------------------------------------------------------------
// Claude Code

const CLAUDE_USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const CLAUDE_USAGE_BETA_HEADER = 'oauth-2025-04-20';

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    subscriptionType?: string;
  };
}

interface ClaudeUsageResponse {
  five_hour?: { utilization?: number; resets_at?: string } | null;
  seven_day?: { utilization?: number; resets_at?: string } | null;
}

export function mapClaudeUsage(raw: unknown): UsageWindowInfo[] {
  if (!isRecord(raw)) return [];
  const windows: UsageWindowInfo[] = [];
  const entries: Array<['5h' | '7d', string, unknown]> = [
    ['5h', '5h', raw.five_hour],
    ['7d', '7d', raw.seven_day],
  ];
  for (const [id, label, value] of entries) {
    if (!isRecord(value) || !isNumber(value.utilization)) continue;
    windows.push({
      id,
      label,
      pct: clamp(value.utilization / 100),
      resetsAt: typeof value.resets_at === 'string' ? value.resets_at : null,
    });
  }
  return windows;
}

async function readClaudeCredentials(): Promise<ClaudeCredentials | null> {
  const path = join(homedir(), '.claude', '.credentials.json');
  try {
    const raw = await readFile(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.claudeAiOauth)) return null;
    return parsed as ClaudeCredentials;
  } catch {
    return null;
  }
}

export async function fetchClaudeUsage(): Promise<AgentUsageResult> {
  const now = Date.now();
  const hit = cached(claudeCache, now);
  if (hit) return hit;

  try {
    const credentials = await readClaudeCredentials();
    const oauth = credentials?.claudeAiOauth;
    if (typeof oauth?.accessToken !== 'string' || !oauth.accessToken) {
      const result = unavailable(CLAUDE_PROVIDER);
      claudeCache = saveCache(result, now, false);
      return result;
    }
    const data = (await requestJson(CLAUDE_USAGE_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${oauth.accessToken}`,
        'anthropic-beta': CLAUDE_USAGE_BETA_HEADER,
        accept: 'application/json',
      },
    })) as ClaudeUsageResponse;
    const result: AgentUsageResult = {
      provider: CLAUDE_PROVIDER,
      source: 'live',
      plan: oauth.subscriptionType ?? null,
      windows: mapClaudeUsage(data),
    };
    claudeCache = saveCache(result, now, true);
    return result;
  } catch (error) {
    const result = unavailable(
      CLAUDE_PROVIDER,
      error instanceof UsageHttpError && error.status === 401 ? 'unauthorized' : 'unavailable',
    );
    claudeCache = saveCache(result, now, false);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Codex CLI

const CODEX_USAGE_ENDPOINT = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_REFRESH_ENDPOINT = 'https://auth.openai.com/oauth/token';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

interface CodexAuth {
  auth_mode?: string;
  tokens?: {
    access_token?: string;
    account_id?: string;
    refresh_token?: string;
  };
}

function isoFromUnixSeconds(value: unknown): string | null {
  if (!isNumber(value)) return null;
  try {
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

function windowLabel(seconds: number): string {
  if (seconds === 18_000) return '5h';
  if (seconds === 604_800) return '7d';
  if (seconds >= 86_400 && seconds % 86_400 === 0) return `${Math.round(seconds / 86_400)}d`;
  return `${Math.round(seconds / 3_600)}h`;
}

export function mapCodexUsage(raw: unknown): {
  plan: string | null;
  windows: UsageWindowInfo[];
} {
  if (!isRecord(raw)) return { plan: null, windows: [] };
  const rateLimit = isRecord(raw.rate_limit) ? raw.rate_limit : null;
  const windows: UsageWindowInfo[] = [];
  for (const key of ['primary_window', 'secondary_window']) {
    const value = rateLimit?.[key];
    if (!isRecord(value) || !isNumber(value.used_percent)) continue;
    const seconds = value.limit_window_seconds;
    if (!isNumber(seconds) || seconds <= 0) continue;
    const standardId = seconds === 18_000 ? '5h' : seconds === 604_800 ? '7d' : null;
    windows.push({
      id: standardId ?? `codex:${seconds}`,
      label: windowLabel(seconds),
      pct: clamp(value.used_percent / 100),
      resetsAt: isoFromUnixSeconds(value.reset_at),
    });
  }
  return {
    plan: typeof raw.plan_type === 'string' ? raw.plan_type : null,
    windows,
  };
}

async function readCodexAuth(): Promise<CodexAuth | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(homedir(), '.codex', 'auth.json'), 'utf8'),
    );
    return isRecord(parsed) ? (parsed as CodexAuth) : null;
  } catch {
    return null;
  }
}

async function refreshCodexToken(refreshToken: string): Promise<string> {
  const data = await requestJson(CODEX_REFRESH_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: CODEX_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!isRecord(data) || typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Codex token refresh returned no access token');
  }
  // Never write auth.json: it is owned and maintained by the Codex CLI.
  return data.access_token;
}

async function requestCodexUsage(accessToken: string, accountId: string): Promise<unknown> {
  // This is an undocumented ChatGPT/Codex endpoint.
  return requestJson(CODEX_USAGE_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'ChatGPT-Account-Id': accountId,
      Accept: 'application/json',
    },
  });
}

export async function fetchCodexUsage(): Promise<AgentUsageResult> {
  const now = Date.now();
  const hit = cached(codexCache, now);
  if (hit) return hit;

  try {
    const auth = await readCodexAuth();
    const tokens = auth?.tokens;
    if (
      auth?.auth_mode !== 'chatgpt' ||
      typeof tokens?.access_token !== 'string' ||
      !tokens.access_token ||
      typeof tokens.account_id !== 'string' ||
      !tokens.account_id
    ) {
      const result = unavailable(CODEX_PROVIDER);
      codexCache = saveCache(result, now, false);
      return result;
    }

    let data: unknown;
    try {
      data = await requestCodexUsage(tokens.access_token, tokens.account_id);
    } catch (error) {
      if (!(error instanceof UsageHttpError) || error.status !== 401) throw error;
      if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) {
        const result = unavailable(CODEX_PROVIDER, 'unauthorized');
        codexCache = saveCache(result, now, false);
        return result;
      }
      let refreshed: string;
      try {
        refreshed = await refreshCodexToken(tokens.refresh_token);
      } catch {
        const result = unavailable(CODEX_PROVIDER, 'unauthorized');
        codexCache = saveCache(result, now, false);
        return result;
      }
      try {
        data = await requestCodexUsage(refreshed, tokens.account_id);
      } catch (retryError) {
        const result = unavailable(
          CODEX_PROVIDER,
          retryError instanceof UsageHttpError && retryError.status === 401
            ? 'unauthorized'
            : 'unavailable',
        );
        codexCache = saveCache(result, now, false);
        return result;
      }
    }

    const mapped = mapCodexUsage(data);
    const result: AgentUsageResult = {
      provider: CODEX_PROVIDER,
      source: 'live',
      plan: mapped.plan,
      windows: mapped.windows,
    };
    codexCache = saveCache(result, now, true);
    return result;
  } catch {
    const result = unavailable(CODEX_PROVIDER);
    codexCache = saveCache(result, now, false);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Antigravity / agy CLI

const AGY_CODE_ASSIST_ENDPOINT = 'https://daily-cloudcode-pa.googleapis.com/v1internal';
const AGY_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const AGY_DEFAULT_CLIENT_ID =
  '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const AGY_DEFAULT_CLIENT_SECRET = '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';
const AGY_KEYRING_LABEL = "Password for 'antigravity' on 'gemini'";

interface AntigravityToken {
  access_token?: string;
  refresh_token?: string;
  expiry?: string | number;
  token_type?: string;
}

const execFileAsync = promisify(execFile);
const KEYRING_SCRIPT = `
import secretstorage, json
bus = secretstorage.dbus_init()
for coll in secretstorage.get_all_collections(bus):
    if coll.is_locked(): continue
    for it in coll.get_all_items():
        if it.get_label() == ${JSON.stringify(AGY_KEYRING_LABEL)}:
            print(json.dumps(json.loads(it.get_secret().decode('utf-8')))); raise SystemExit
`;

export type AntigravityKeyringReader = () => Promise<unknown | null>;

async function readAntigravityKeyring(): Promise<unknown | null> {
  try {
    const result = await execFileAsync('python3', ['-c', KEYRING_SCRIPT], {
      timeout: 5_000,
      maxBuffer: 1_024 * 1_024,
    });
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

let keyringReader: AntigravityKeyringReader = readAntigravityKeyring;

/** Test seam for the GNOME keyring lookup. */
export function setAntigravityKeyringReader(reader: AntigravityKeyringReader | null): void {
  keyringReader = reader ?? readAntigravityKeyring;
  agyCache = null;
  resetAntigravityTokenMemo();
}

export function parseAntigravitySecret(raw: unknown): AntigravityToken | null {
  let secret: unknown = raw;
  if (typeof secret === 'string') {
    try {
      secret = JSON.parse(secret);
    } catch {
      return null;
    }
  }
  if (!isRecord(secret)) return null;
  let token: unknown = secret.token;
  if (typeof token === 'string') {
    try {
      token = JSON.parse(token);
    } catch {
      return null;
    }
  }
  if (!isRecord(token) || typeof token.access_token !== 'string' || !token.access_token) {
    return null;
  }
  return token as AntigravityToken;
}

// Memoized refresh result so polling `cost:usage` once a minute does not hit
// Google's OAuth endpoint on every cycle (the keyring's stored access token is
// usually stale, so without this we would refresh ~1440x/day).
interface MemoizedAgyToken {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}
let agyTokenMemo: MemoizedAgyToken | null = null;
const AGY_TOKEN_EARLY_MS = 60_000;
// Google refresh responses always include expires_in (~1h); conservative
// fallback if it is ever missing.
const AGY_REFRESH_DEFAULT_TTL_MS = 50 * 60_000;

function resetAntigravityTokenMemo(): void {
  agyTokenMemo = null;
}

/** Parse the keyring token `expiry` (Go RFC3339Nano string, or epoch seconds/ms). */
function antigravityExpiryMs(expiry: unknown): number | null {
  if (typeof expiry === 'string') {
    const parsed = Date.parse(expiry);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (isNumber(expiry) && expiry > 0) {
    return expiry > 1e12 ? expiry : expiry * 1000;
  }
  return null;
}

async function refreshAntigravityAccessToken(refreshToken: string): Promise<string> {
  const { accessToken, expiresAt } = await refreshAntigravityToken(refreshToken);
  agyTokenMemo = { refreshToken, accessToken, expiresAt };
  return accessToken;
}

export function mapAgyQuotaSummary(raw: unknown): UsageWindowInfo[] {
  if (!isRecord(raw) || !Array.isArray(raw.groups)) {
    throw new Error('Invalid Antigravity quota summary');
  }
  const candidates: Array<{ window: UsageWindowInfo; weekly: boolean; index: number }> = [];
  raw.groups.forEach((group, groupIndex) => {
    if (!isRecord(group) || !Array.isArray(group.buckets)) {
      throw new Error('Invalid Antigravity quota group');
    }
    const groupName = typeof group.displayName === 'string' && group.displayName
      ? group.displayName
      : 'Quota';
    group.buckets.forEach((bucket, bucketIndex) => {
      if (!isRecord(bucket)) throw new Error('Invalid Antigravity quota bucket');
      if (bucket.disabled === true) return;
      if (
        !isNumber(bucket.remainingFraction) ||
        bucket.remainingFraction < 0 ||
        bucket.remainingFraction > 1
      ) {
        throw new Error('Invalid Antigravity remaining fraction');
      }
      const bucketType = typeof bucket.bucketType === 'string' ? bucket.bucketType : '';
      const period = typeof bucket.period === 'string' ? bucket.period : '';
      const kind = bucketType || period;
      if (!kind) return;
      candidates.push({
        weekly: period === 'weekly' || bucketType === 'weekly',
        index: groupIndex * 100 + bucketIndex,
        window: {
          id: `${groupName}:${kind}`,
          label: period || kind,
          pct: clamp(1 - bucket.remainingFraction),
          resetsAt: null,
          detail: groupName,
        },
      });
    });
  });
  candidates.sort((a, b) => Number(b.weekly) - Number(a.weekly) || a.index - b.index);
  return candidates.slice(0, 4).map(({ window }) => window);
}

async function refreshAntigravityToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  // These public client credentials are embedded in the agy CLI binary. They
  // can be overridden for installations that use a different OAuth client.
  const clientId = process.env.AGY_OAUTH_CLIENT_ID || AGY_DEFAULT_CLIENT_ID;
  const clientSecret = process.env.AGY_OAUTH_CLIENT_SECRET || AGY_DEFAULT_CLIENT_SECRET;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const data = await requestJson(AGY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
  });
  if (!isRecord(data) || typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Antigravity token refresh returned no access token');
  }
  const ttlMs =
    isNumber(data.expires_in) && data.expires_in > 0
      ? data.expires_in * 1000
      : AGY_REFRESH_DEFAULT_TTL_MS;
  // The keyring belongs to agy; keep refreshed credentials in memory only.
  return { accessToken: data.access_token, expiresAt: Date.now() + ttlMs };
}

async function readAgyProjectFallback(): Promise<string | null> {
  try {
    const project = (
      await readFile(
        join(homedir(), '.gemini', 'antigravity-cli', 'cache', 'default_project_id.txt'),
        'utf8',
      )
    ).trim();
    return project || null;
  } catch {
    return null;
  }
}

async function agyPost(method: string, body: unknown, accessToken: string): Promise<unknown> {
  return requestJson(`${AGY_CODE_ASSIST_ENDPOINT}:${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export async function fetchAgyUsage(): Promise<AgentUsageResult> {
  const now = Date.now();
  const hit = cached(agyCache, now);
  if (hit) return hit;

  let plan: string | null = null;
  try {
    const credentials = parseAntigravitySecret(await keyringReader());
    if (!credentials || typeof credentials.access_token !== 'string') {
      const result = unavailable(AGY_PROVIDER);
      agyCache = saveCache(result, now, false);
      return result;
    }
    const refreshToken = typeof credentials.refresh_token === 'string'
      ? credentials.refresh_token
      : null;

    // Prefer the keyring token while it is still valid; otherwise reuse a
    // memoized refresh within its lifetime, and only then hit Google OAuth.
    const keyringExpiry = antigravityExpiryMs(credentials.expiry);
    let accessToken: string;
    if (keyringExpiry !== null && keyringExpiry - AGY_TOKEN_EARLY_MS > now) {
      accessToken = credentials.access_token;
    } else if (
      agyTokenMemo &&
      refreshToken === agyTokenMemo.refreshToken &&
      agyTokenMemo.expiresAt - AGY_TOKEN_EARLY_MS > now
    ) {
      accessToken = agyTokenMemo.accessToken;
    } else if (refreshToken) {
      try {
        accessToken = await refreshAntigravityAccessToken(refreshToken);
      } catch {
        const result = unavailable(AGY_PROVIDER);
        agyCache = saveCache(result, now, false);
        return result;
      }
    } else {
      // No expiry info and no refresh token: best effort with the stored token.
      accessToken = credentials.access_token;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const load = await agyPost(
          'loadCodeAssist',
          { metadata: { ideType: 'ANTIGRAVITY' } },
          accessToken,
        );
        if (isRecord(load)) {
          for (const tierKey of ['currentTier', 'paidTier']) {
            const tier = load[tierKey];
            if (isRecord(tier) && typeof tier.name === 'string' && tier.name) {
              plan = tier.name;
              break;
            }
          }
        }
        const project = isRecord(load) && typeof load.cloudaicompanionProject === 'string'
          ? load.cloudaicompanionProject
          : await readAgyProjectFallback();
        if (!project) throw new Error('No Antigravity project available');
        const summary = await agyPost(
          'retrieveUserQuotaSummary',
          { project },
          accessToken,
        );
        const result: AgentUsageResult = {
          provider: AGY_PROVIDER,
          source: 'live',
          plan,
          windows: mapAgyQuotaSummary(summary),
        };
        agyCache = saveCache(result, now, true);
        return result;
      } catch (error) {
        if (error instanceof UsageHttpError && error.status === 401 && attempt === 0) {
          if (typeof credentials.refresh_token !== 'string' || !credentials.refresh_token) {
            const result = unavailable(AGY_PROVIDER, 'unauthorized');
            agyCache = saveCache(result, now, false);
            return result;
          }
          try {
            accessToken = await refreshAntigravityAccessToken(refreshToken ?? '');
          } catch {
            const result = unavailable(AGY_PROVIDER, 'unauthorized');
            agyCache = saveCache(result, now, false);
            return result;
          }
          continue;
        }
        const result = unavailable(
          AGY_PROVIDER,
          error instanceof UsageHttpError && error.status === 401
            ? 'unauthorized'
            : 'unavailable',
        );
        agyCache = saveCache(result, now, false);
        return result;
      }
    }
  } catch {
    const result = unavailable(AGY_PROVIDER);
    agyCache = saveCache(result, now, false);
    return result;
  }
  const result = unavailable(AGY_PROVIDER);
  agyCache = saveCache(result, now, false);
  return result;
}

// ---------------------------------------------------------------------------
// GitHub Copilot CLI

const COPILOT_ENDPOINT = 'https://api.github.com/copilot_internal/user';

export function mapCopilotUsage(raw: unknown): {
  plan: string | null;
  windows: UsageWindowInfo[];
} {
  if (!isRecord(raw)) return { plan: null, windows: [] };
  const premium = isRecord(raw.quota_snapshots)
    && isRecord(raw.quota_snapshots.premium_interactions)
    ? raw.quota_snapshots.premium_interactions
    : null;
  if (!premium || premium.unlimited === true || !isNumber(premium.entitlement) || premium.entitlement <= 0) {
    return {
      plan: typeof raw.copilot_plan === 'string' ? raw.copilot_plan : null,
      windows: [],
    };
  }
  let remainingFraction: number | null = null;
  if (isNumber(premium.percent_remaining)) {
    remainingFraction = premium.percent_remaining / 100;
  } else if (isNumber(premium.remaining)) {
    remainingFraction = premium.remaining / premium.entitlement;
  }
  if (remainingFraction === null) {
    return {
      plan: typeof raw.copilot_plan === 'string' ? raw.copilot_plan : null,
      windows: [],
    };
  }
  const resetDate = typeof raw.quota_reset_date === 'string' ? raw.quota_reset_date : null;
  let resetsAt: string | null = null;
  if (resetDate) {
    try {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(resetDate)
        ? new Date(`${resetDate}T00:00:00.000Z`)
        : new Date(resetDate);
      if (!Number.isNaN(date.getTime())) resetsAt = date.toISOString();
    } catch {
      resetsAt = null;
    }
  }
  const remaining = isNumber(premium.remaining) ? premium.remaining : null;
  const detail = remaining === null
    ? null
    : `${remaining} / ${premium.entitlement}`;
  return {
    plan: typeof raw.copilot_plan === 'string' ? raw.copilot_plan : null,
    windows: [{
      id: 'monthly',
      label: 'monthly',
      pct: clamp(1 - remainingFraction),
      resetsAt,
      detail,
    }],
  };
}

async function readCopilotToken(): Promise<string | null> {
  try {
    const raw = await readFile(join(homedir(), '.config', 'gh', 'hosts.yml'), 'utf8');
    return raw.match(/^\s*oauth_token:\s*(\S+)/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function fetchCopilotUsage(): Promise<AgentUsageResult> {
  const now = Date.now();
  const hit = cached(copilotCache, now);
  if (hit) return hit;
  try {
    const token = await readCopilotToken();
    if (!token) {
      const result = unavailable(COPILOT_PROVIDER);
      copilotCache = saveCache(result, now, false);
      return result;
    }
    // This is an undocumented GitHub Copilot endpoint.
    const mapped = mapCopilotUsage(await requestJson(COPILOT_ENDPOINT, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/json',
        'Editor-Version': 'vscode/1.96.2',
        'Editor-Plugin-Version': 'copilot-chat/0.26.7',
        'X-Github-Api-Version': '2025-04-01',
      },
    }));
    const result: AgentUsageResult = {
      provider: COPILOT_PROVIDER,
      source: 'live',
      plan: mapped.plan,
      windows: mapped.windows,
    };
    copilotCache = saveCache(result, now, true);
    return result;
  } catch (error) {
    const result = unavailable(
      COPILOT_PROVIDER,
      error instanceof UsageHttpError && error.status === 401 ? 'unauthorized' : 'unavailable',
    );
    copilotCache = saveCache(result, now, false);
    return result;
  }
}

const PROVIDERS = [fetchClaudeUsage, fetchCodexUsage, fetchAgyUsage, fetchCopilotUsage] as const;

export async function usage(_deps: HandlerDeps): Promise<CostUsageResult> {
  void _deps;
  const providers = await Promise.all(PROVIDERS.map((fetcher) => fetcher()));
  return { providers };
}
