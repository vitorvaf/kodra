import {
  createAgentMemoryClient,
  type AgentMemoryClient,
  type MemoryHit,
  type TeamFeedItem,
} from './client.js';
import { buildMemoryContext, type MemoryContextItem, type MemoryScope } from './context-builder.js';
import { findCredentials } from './redaction.js';
import type { ResolvedMemoryConfig } from './config.js';

/**
 * MemoryProvider — the single seam the application uses to talk to memory.
 *
 * Application code depends on this interface only. `AgentMemoryProvider`
 * speaks AgentMemory's official HTTP API; `NoopMemoryProvider` is used when
 * memory is disabled. Every method is best-effort: a failing or unreachable
 * server logs a warning and degrades to an empty/failed result, never throws.
 */
export type MemoryKind =
  | 'architecture_decision'
  | 'bug'
  | 'lesson_learned'
  | 'constraint'
  | 'integration_behavior'
  | 'project_convention'
  | 'developer_preference'
  | 'investigation'
  | 'temporary_context'
  | 'decision'
  | 'run_summary';

export type MemoryConfidence = 'hypothesis' | 'observation' | 'confirmed';
export type MemorySource = 'code' | 'developer' | 'pr' | 'adr' | 'issue' | 'agent';

export interface MemoryProvenance {
  repository?: string;
  branch?: string;
  commit?: string;
  file?: string;
}

export interface RememberInput {
  content: string;
  kind?: MemoryKind;
  confidence?: MemoryConfidence;
  source?: MemorySource;
  /** Free-form tags; stored in AgentMemory's `concepts`. */
  concepts?: string[];
  files?: string[];
  /** Overrides the configured project id for this write. */
  project?: string;
  /** Overrides the configured agent id for this write. */
  agentId?: string;
  provenance?: MemoryProvenance;
  /** Auto-expire after N days (AgentMemory `ttlDays`). */
  ttlDays?: number;
}

export type RememberFailure =
  | 'disabled'
  | 'unavailable'
  | 'rejected_credentials'
  | 'invalid'
  | 'error';

export interface RememberResult {
  ok: boolean;
  memoryId: string | null;
  scope: MemoryScope;
  reason?: RememberFailure;
  /** Set when AgentMemory found a near-duplicate it did not supersede. */
  similarTo?: string;
}

export interface RecallInput {
  query: string;
  limit?: number;
  project?: string;
  agentId?: string;
  /** Include the team's shared feed (default true when a team is configured). */
  includeTeam?: boolean;
}

export interface MemoryRecord extends MemoryContextItem {
  id: string | null;
  sharedBy?: string | undefined;
  project?: string | undefined;
}

export type MemoryHealthState = 'disabled' | 'healthy' | 'unavailable';

export interface MemoryProvider {
  readonly name: 'agentmemory' | 'noop';
  getConfig(): ResolvedMemoryConfig;
  remember(input: RememberInput): Promise<RememberResult>;
  recall(input: RecallInput): Promise<MemoryRecord[]>;
  /** Promote a private memory into the team's shared feed. */
  share(memoryId: string, opts?: { project?: string }): Promise<boolean>;
  forget(memoryId: string): Promise<boolean>;
  health(): Promise<boolean>;
  status(): Promise<MemoryHealthState>;
  /** Recall + format, honouring the configured context limits. */
  recallContext(input: RecallInput): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Noop

export function createNoopMemoryProvider(getConfig: () => ResolvedMemoryConfig): MemoryProvider {
  return {
    name: 'noop',
    getConfig,
    async remember() {
      return { ok: false, memoryId: null, scope: 'private', reason: 'disabled' };
    },
    async recall() {
      return [];
    },
    async share() {
      return false;
    },
    async forget() {
      return false;
    },
    async health() {
      return false;
    },
    async status() {
      return 'disabled';
    },
    async recallContext() {
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// AgentMemory

/** Maps Kodra's conceptual kinds onto AgentMemory's own `type` vocabulary. */
const KIND_TO_TYPE: Record<MemoryKind, string> = {
  architecture_decision: 'architecture',
  decision: 'architecture',
  bug: 'bug',
  lesson_learned: 'pattern',
  constraint: 'fact',
  integration_behavior: 'fact',
  project_convention: 'workflow',
  developer_preference: 'preference',
  investigation: 'fact',
  temporary_context: 'fact',
  run_summary: 'workflow',
};

const TEMPORARY_TTL_DAYS = 7;

function log(level: 'info' | 'warn', message: string): void {
  try {
    console[level](`[memory] ${message}`);
  } catch {
    // never let logging break the best-effort contract
  }
}

function tokens(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9à-ÿ_]+/i)
        .filter((t) => t.length >= 4),
    ),
  );
}

function hitToRecord(hit: MemoryHit): MemoryRecord {
  const createdAt =
    typeof hit.timestamp === 'string'
      ? hit.timestamp
      : typeof hit.createdAt === 'string'
        ? hit.createdAt
        : undefined;
  return {
    id: typeof hit.id === 'string' ? hit.id : null,
    content: hit.content,
    scope: 'private',
    type: typeof hit.type === 'string' ? hit.type : undefined,
    score: typeof hit.score === 'number' ? hit.score : undefined,
    createdAt,
  };
}

function feedItemToRecord(item: TeamFeedItem): MemoryRecord {
  return {
    id: item.id,
    content: item.content,
    scope: 'team',
    type: item.type,
    createdAt: item.sharedAt,
    sharedBy: item.sharedBy,
    project: item.project,
  };
}

export interface AgentMemoryProviderOptions {
  getConfig: () => ResolvedMemoryConfig;
  /** Test seam: inject a client instead of building one from config. */
  client?: AgentMemoryClient;
  now?: () => number;
}

export function createAgentMemoryProvider(options: AgentMemoryProviderOptions): MemoryProvider {
  const now = options.now ?? (() => Date.now());

  let cachedClient: { key: string; client: AgentMemoryClient } | null = null;
  function client(): AgentMemoryClient {
    if (options.client) return options.client;
    const cfg = options.getConfig();
    const key = `${cfg.url}|${cfg.secret ?? ''}|${cfg.timeoutMs}`;
    if (cachedClient?.key !== key) {
      cachedClient = {
        key,
        client: createAgentMemoryClient({
          baseUrl: cfg.url,
          secret: cfg.secret,
          timeoutMs: cfg.timeoutMs,
        }),
      };
    }
    return cachedClient.client;
  }

  let healthCache: { at: number; ok: boolean } | null = null;
  let warnedUnavailable = false;

  async function probe(): Promise<boolean> {
    const cfg = options.getConfig();
    if (healthCache && now() - healthCache.at < cfg.healthCacheMs) return healthCache.ok;
    const ok = await client().health();
    healthCache = { at: now(), ok };
    if (!ok && !warnedUnavailable) {
      warnedUnavailable = true;
      log('warn', `unavailable url=${cfg.url} — continuing without memory`);
    }
    if (ok) warnedUnavailable = false;
    return ok;
  }

  function identityConcepts(cfg: ResolvedMemoryConfig, input: RememberInput): string[] {
    const out = new Set<string>(input.concepts ?? []);
    out.add('scope:private');
    if (input.kind) out.add(`kind:${input.kind}`);
    if (input.confidence) out.add(`confidence:${input.confidence}`);
    if (input.source) out.add(`source:${input.source}`);
    if (cfg.userId) out.add(`user:${cfg.userId}`);
    if (cfg.teamId) out.add(`team:${cfg.teamId}`);
    const agent = input.agentId ?? cfg.agentId;
    if (agent) out.add(`agent:${agent}`);
    const p = input.provenance;
    if (p?.repository) out.add(`repo:${p.repository}`);
    if (p?.branch) out.add(`branch:${p.branch}`);
    if (p?.commit) out.add(`commit:${p.commit.slice(0, 12)}`);
    if (p?.file) out.add(`file:${p.file}`);
    return [...out];
  }

  const provider: MemoryProvider = {
    name: 'agentmemory',
    getConfig: options.getConfig,

    async remember(input) {
      const cfg = options.getConfig();
      if (!cfg.enabled) return { ok: false, memoryId: null, scope: 'private', reason: 'disabled' };
      const content = input.content.trim();
      if (content.length === 0) {
        return { ok: false, memoryId: null, scope: 'private', reason: 'invalid' };
      }
      const leaks = findCredentials(content);
      if (leaks.length > 0) {
        log('warn', `remember rejected: content looks like a credential (${leaks.join(', ')})`);
        return { ok: false, memoryId: null, scope: 'private', reason: 'rejected_credentials' };
      }
      const project = input.project ?? cfg.project ?? undefined;
      const agentId = input.agentId ?? cfg.agentId ?? undefined;
      const ttlDays =
        input.ttlDays ?? (input.kind === 'temporary_context' ? TEMPORARY_TTL_DAYS : undefined);
      const started = now();
      // No retry on purpose: AgentMemory has no idempotency key, so a retried
      // write after an ambiguous failure could store the memory twice.
      const result = await client().remember({
        content,
        ...(input.kind ? { type: KIND_TO_TYPE[input.kind] } : {}),
        concepts: identityConcepts(cfg, input),
        ...(input.files ? { files: input.files } : {}),
        ...(project ? { project } : {}),
        ...(agentId ? { agentId } : {}),
        ...(ttlDays !== undefined ? { ttlDays } : {}),
      });
      if (result === null) {
        healthCache = null;
        return { ok: false, memoryId: null, scope: 'private', reason: 'unavailable' };
      }
      log(
        'info',
        `remember ok memory_id=${result.id ?? 'n/a'} scope=private kind=${input.kind ?? 'n/a'} project=${project ?? 'n/a'} duration_ms=${now() - started}`,
      );
      return {
        ok: true,
        memoryId: result.id,
        scope: 'private',
        ...(result.similarTo ? { similarTo: result.similarTo } : {}),
      };
    },

    async recall(input) {
      const cfg = options.getConfig();
      if (!cfg.enabled) return [];
      const query = input.query.trim();
      if (query.length === 0) return [];
      const limit = Math.max(1, Math.min(input.limit ?? cfg.maxContextItems, 100));
      const project = input.project ?? cfg.project ?? undefined;
      const agentId = input.agentId ?? cfg.agentId ?? undefined;
      const includeTeam = input.includeTeam ?? cfg.teamId !== null;
      const started = now();

      const c = client();
      const [hits, feed] = await Promise.all([
        c.smartSearch({
          query,
          topK: limit,
          ...(project ? { namespace: project } : {}),
          ...(agentId ? { agentId } : {}),
        }),
        includeTeam ? c.teamFeed(Math.max(limit, 20)) : Promise.resolve([] as TeamFeedItem[]),
      ]);

      const words = tokens(query);
      const teamRecords = feed
        .filter((item) => !project || item.project === '' || item.project === project)
        .filter((item) => {
          const text = item.content.toLowerCase();
          return words.length === 0 || words.some((w) => text.includes(w));
        })
        .map(feedItemToRecord);
      const privateRecords = hits.map(hitToRecord);

      const merged: MemoryRecord[] = [];
      const seen = new Set<string>();
      for (const record of [...teamRecords, ...privateRecords]) {
        const key = record.content.replace(/\s+/g, ' ').trim().slice(0, 120).toLowerCase();
        if (key.length === 0 || seen.has(key)) continue;
        seen.add(key);
        merged.push(record);
        if (merged.length >= limit) break;
      }
      if (hits.length === 0 && feed.length === 0) {
        // Distinguish "nothing known" from "server down" without an extra probe per call.
        void probe();
      }
      log(
        'info',
        `recall ok project=${project ?? 'n/a'} team=${teamRecords.length} private=${privateRecords.length} result_count=${merged.length} duration_ms=${now() - started}`,
      );
      return merged;
    },

    async share(memoryId, opts) {
      const cfg = options.getConfig();
      if (!cfg.enabled) return false;
      if (!cfg.teamId) {
        log('warn', 'share skipped: no team configured (AGENTMEMORY_TEAM_ID)');
        return false;
      }
      const project = opts?.project ?? cfg.project ?? undefined;
      const ok = await client().teamShare({
        itemId: memoryId,
        itemType: 'memory',
        ...(project ? { project } : {}),
      });
      log(ok ? 'info' : 'warn', `share ${ok ? 'ok' : 'failed'} memory_id=${memoryId} scope=team`);
      return ok;
    },

    async forget(memoryId) {
      const cfg = options.getConfig();
      if (!cfg.enabled) return false;
      const ok = await client().forget(memoryId);
      log(ok ? 'info' : 'warn', `forget ${ok ? 'ok' : 'failed'} memory_id=${memoryId}`);
      return ok;
    },

    async health() {
      if (!options.getConfig().enabled) return false;
      return probe();
    },

    async status() {
      if (!options.getConfig().enabled) return 'disabled';
      return (await probe()) ? 'healthy' : 'unavailable';
    },

    async recallContext(input) {
      const cfg = options.getConfig();
      const records = await provider.recall(input);
      return buildMemoryContext(records, {
        maxItems: input.limit ?? cfg.maxContextItems,
        maxChars: cfg.maxContextChars,
      });
    },
  };

  return provider;
}

/** Picks the provider for the current configuration; re-evaluated on every call site through `getConfig`. */
export function createMemoryProvider(options: AgentMemoryProviderOptions): MemoryProvider {
  const real = createAgentMemoryProvider(options);
  const noop = createNoopMemoryProvider(options.getConfig);
  // A thin switch so toggling `enabled` at runtime (settings UI or env) takes
  // effect without rebuilding the object graph.
  const pick = () => (options.getConfig().enabled ? real : noop);
  return {
    get name() {
      return pick().name;
    },
    getConfig: options.getConfig,
    remember: (input) => pick().remember(input),
    recall: (input) => pick().recall(input),
    share: (id, opts) => pick().share(id, opts),
    forget: (id) => pick().forget(id),
    health: () => pick().health(),
    status: () => pick().status(),
    recallContext: (input) => pick().recallContext(input),
  };
}
