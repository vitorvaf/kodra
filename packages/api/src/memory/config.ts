import type { MemoryConfig } from '@kanbots/local-store';

/**
 * Resolved AgentMemory settings used by the MemoryProvider layer.
 *
 * Precedence, highest first:
 *   1. `AGENTMEMORY_*` environment variables (see docs/agent-memory.md)
 *   2. the workspace `memory` section of `.kodra/config.json`
 *   3. built-in defaults
 *
 * Identity fields (`project`, `teamId`, `userId`, `agentId`) always come from
 * configuration — nothing here is a hardcoded singleton identity, so several
 * developers and agents can point at the same AgentMemory server.
 */
export type MemoryMode = 'private' | 'shared';

export interface ResolvedMemoryConfig {
  enabled: boolean;
  url: string;
  secret: string | null;
  /** Stable canonical project id sent as AgentMemory's `project` field. */
  project: string | null;
  teamId: string | null;
  userId: string | null;
  agentId: string | null;
  /** Mirrors AgentMemory's server-side `TEAM_MODE` (private | shared). */
  mode: MemoryMode;
  timeoutMs: number;
  maxContextItems: number;
  maxContextChars: number;
  /** How long a livez result is trusted before probing again. */
  healthCacheMs: number;
}

export const MEMORY_ENV = {
  enabled: 'AGENTMEMORY_ENABLED',
  url: 'AGENTMEMORY_URL',
  secret: 'AGENTMEMORY_SECRET',
  project: 'AGENTMEMORY_PROJECT',
  teamId: 'AGENTMEMORY_TEAM_ID',
  userId: 'AGENTMEMORY_USER_ID',
  agentId: 'AGENTMEMORY_AGENT_ID',
  mode: 'AGENTMEMORY_MODE',
  timeoutMs: 'AGENTMEMORY_TIMEOUT_MS',
  maxContextItems: 'AGENTMEMORY_MAX_CONTEXT_ITEMS',
  maxContextChars: 'AGENTMEMORY_MAX_CONTEXT_CHARS',
  healthCacheMs: 'AGENTMEMORY_HEALTH_CACHE_MS',
} as const;

export const MEMORY_DEFAULTS = {
  url: 'http://localhost:3111',
  mode: 'private' as MemoryMode,
  timeoutMs: 2000,
  maxContextItems: 10,
  maxContextChars: 8000,
  healthCacheMs: 30_000,
} as const;

type EnvLike = Record<string, string | undefined>;

function readString(env: EnvLike, key: string): string | null {
  const raw = env[key];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBoolean(env: EnvLike, key: string): boolean | null {
  const raw = readString(env, key);
  if (raw === null) return null;
  const v = raw.toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return null;
}

function readInt(env: EnvLike, key: string, fallback: number, min: number, max: number): number {
  const raw = readString(env, key);
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function resolveMemoryConfig(input: {
  env?: EnvLike;
  workspace?: MemoryConfig | undefined;
}): ResolvedMemoryConfig {
  const env = input.env ?? {};
  const ws = input.workspace;

  const enabled = readBoolean(env, MEMORY_ENV.enabled) ?? ws?.enabled ?? false;
  const url = readString(env, MEMORY_ENV.url) ?? ws?.url ?? MEMORY_DEFAULTS.url;
  const secret = readString(env, MEMORY_ENV.secret) ?? ws?.secret ?? null;

  const teamId =
    readString(env, MEMORY_ENV.teamId) ?? (ws?.scope === 'team' ? ws.teamId : null) ?? null;
  const rawMode = readString(env, MEMORY_ENV.mode)?.toLowerCase();
  const mode: MemoryMode = rawMode === 'shared' ? 'shared' : MEMORY_DEFAULTS.mode;

  return {
    enabled,
    url: url.replace(/\/+$/, ''),
    secret,
    project: readString(env, MEMORY_ENV.project),
    teamId,
    userId: readString(env, MEMORY_ENV.userId),
    agentId: readString(env, MEMORY_ENV.agentId),
    mode,
    timeoutMs: readInt(env, MEMORY_ENV.timeoutMs, MEMORY_DEFAULTS.timeoutMs, 100, 60_000),
    maxContextItems: readInt(
      env,
      MEMORY_ENV.maxContextItems,
      MEMORY_DEFAULTS.maxContextItems,
      1,
      100,
    ),
    maxContextChars: readInt(
      env,
      MEMORY_ENV.maxContextChars,
      MEMORY_DEFAULTS.maxContextChars,
      200,
      200_000,
    ),
    healthCacheMs: readInt(
      env,
      MEMORY_ENV.healthCacheMs,
      MEMORY_DEFAULTS.healthCacheMs,
      0,
      600_000,
    ),
  };
}

/**
 * Derive a stable project id from a repository path when none is configured.
 * AgentMemory asks for a canonical identifier rather than a filesystem path,
 * so only the last path segment is used (lowercased, non-alphanumerics → `-`).
 */
export function projectIdFromPath(repoPath: string): string {
  const segment =
    repoPath
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? 'project';
  const slug = segment
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'project';
}
