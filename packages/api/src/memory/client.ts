export interface MemoryClientConfig {
  baseUrl: string;
  secret?: string | null;
  timeoutMs?: number;
}

export interface MemoryHit {
  id?: string;
  content: string;
  score?: number;
  sessionId?: string;
  [key: string]: unknown;
}

export interface SmartSearchInput {
  query: string;
  /** agentmemory has no `namespace` field; this maps to its `project` field. See ADR-0004. */
  namespace?: string;
  sessionId?: string;
  topK?: number;
}

export interface SaveMemoryInput {
  content: string;
  sessionId?: string;
  namespace?: string;
  kind?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentMemoryClient {
  health(): Promise<boolean>;
  version(): Promise<string | null>;
  smartSearch(input: SmartSearchInput): Promise<MemoryHit[]>;
  getSession(sessionId: string): Promise<{ hasContent: boolean } | null>;
  save(input: SaveMemoryInput): Promise<boolean>;
}

const ENDPOINTS = {
  livez: '/agentmemory/livez',
  health: '/agentmemory/health',
  flags: '/agentmemory/config/flags',
  smartSearch: '/agentmemory/smart-search',
  sessions: '/agentmemory/sessions',
  remember: '/agentmemory/remember',
} as const;

const DEFAULT_TIMEOUT_MS = 1500;

type JsonParser<T> = (body: unknown) => T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function endpointUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${endpoint}`;
}

function failureMessage(error: unknown): string {
  const message = error instanceof Error && error.message ? error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 200);
}

function warnFailure(operation: string, error: unknown): void {
  // Logging must not turn the client's best-effort contract into an exception.
  try {
    console.warn(`[agentmemory] ${operation} failed: ${failureMessage(error)}`);
  } catch {
    // Ignore errors from a replaced or unavailable console.
  }
}

async function request<T>(
  url: string,
  timeoutMs: number,
  init: RequestInit,
  parser?: JsonParser<T>,
): Promise<T | Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!parser) return response;
    return parser(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

function parseVersion(body: unknown): string | null {
  if (isRecord(body) && typeof body.version === 'string') return body.version;
  if (
    isRecord(body) &&
    isRecord(body.service) &&
    typeof body.service.version === 'string'
  ) {
    return body.service.version;
  }
  return null;
}

function parseSearchResults(body: unknown): MemoryHit[] {
  // Lessons are intentionally ignored for now; recall returns observation hits only.
  const results = Array.isArray(body) ? body : isRecord(body) ? body.results : null;
  if (!Array.isArray(results)) return [];

  return results
    .filter(isRecord)
    .map((result) => ({
      id: result.obsId,
      content:
        typeof result.title === 'string'
          ? result.title
          : typeof result.type === 'string'
            ? result.type
            : '',
      score: result.score,
      sessionId: result.sessionId,
      ...result,
    })) as MemoryHit[];
}

function parseSession(body: unknown, sessionId: string): { hasContent: boolean } | null {
  if (!isRecord(body) || !Array.isArray(body.sessions)) return null;

  const session = body.sessions.find(
    (candidate): candidate is Record<string, unknown> =>
      isRecord(candidate) && candidate.id === sessionId,
  );
  return session
    ? {
        hasContent: Boolean(
          (typeof session.observationCount === 'number' && session.observationCount > 0) ||
            session.summary,
        ),
      }
    : null;
}

export function createAgentMemoryClient(config: MemoryClientConfig): AgentMemoryClient {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (config.secret !== undefined && config.secret !== null) {
    headers.Authorization = `Bearer ${config.secret}`;
  }

  const jsonRequest = <T>(url: string, init: RequestInit, parser: JsonParser<T>) =>
    request(url, timeoutMs, init, parser) as Promise<T>;
  const authHeaders = headers;

  return {
    async health(): Promise<boolean> {
      try {
        // livez is deliberately unauthenticated so detection works before auth is configured.
        await request(endpointUrl(config.baseUrl, ENDPOINTS.livez), timeoutMs, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        return true;
      } catch (error) {
        warnFailure('health', error);
        return false;
      }
    },

    async version(): Promise<string | null> {
      try {
        return await jsonRequest(
          endpointUrl(config.baseUrl, ENDPOINTS.flags),
          { method: 'GET', headers: authHeaders },
          parseVersion,
        );
      } catch (error) {
        warnFailure('version', error);
        return null;
      }
    },

    async smartSearch(input: SmartSearchInput): Promise<MemoryHit[]> {
      try {
        return await jsonRequest(
          endpointUrl(config.baseUrl, ENDPOINTS.smartSearch),
          {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: input.query,
              limit: input.topK ?? 3,
              ...(input.namespace ? { project: input.namespace } : {}),
              ...(input.sessionId ? { sessionId: input.sessionId } : {}),
              includeLessons: true,
            }),
          },
          parseSearchResults,
        );
      } catch (error) {
        warnFailure('smartSearch', error);
        return [];
      }
    },

    async getSession(sessionId: string): Promise<{ hasContent: boolean } | null> {
      try {
        return await jsonRequest(
          endpointUrl(config.baseUrl, ENDPOINTS.sessions),
          { method: 'GET', headers: authHeaders },
          (body) => parseSession(body, sessionId),
        );
      } catch (error) {
        warnFailure('getSession', error);
        return null;
      }
    },

    async save(input: SaveMemoryInput): Promise<boolean> {
      try {
        const metadata = input.metadata;
        await request(endpointUrl(config.baseUrl, ENDPOINTS.remember), timeoutMs, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: input.content,
            ...(input.kind ? { type: input.kind } : {}),
            ...(input.namespace ? { project: input.namespace } : {}),
            ...(metadata?.concepts ? { concepts: metadata.concepts } : {}),
            ...(metadata?.files ? { files: metadata.files } : {}),
          }),
        });
        return true;
      } catch (error) {
        warnFailure('save', error);
        return false;
      }
    },
  };
}

export function memorySessionId(parts: {
  workspaceId: string;
  repoId: string;
  issueNumber: string | number;
  runId: number;
}): string {
  return `kanbots:${parts.workspaceId}:${parts.repoId}:${String(parts.issueNumber)}:${parts.runId}`;
}

/** This value is passed as agentmemory's `project` field (agentmemory has no generic `namespace`). See ADR-0004. */
export function memoryNamespace(parts: { workspaceId: string; repoId: string }): string {
  return `kanbots:${parts.workspaceId}:${parts.repoId}`;
}
