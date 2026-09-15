import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMemoryConfig, type ResolvedMemoryConfig } from '../../src/memory/config.js';
import { createMemoryProvider } from '../../src/memory/provider.js';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function config(overrides: Partial<ResolvedMemoryConfig> = {}): ResolvedMemoryConfig {
  return {
    ...resolveMemoryConfig({
      env: {
        AGENTMEMORY_ENABLED: 'true',
        AGENTMEMORY_URL: 'http://memory.test:3111',
        AGENTMEMORY_SECRET: 'top-secret',
        AGENTMEMORY_PROJECT: 'kodra',
        AGENTMEMORY_TEAM_ID: 'platform',
        AGENTMEMORY_USER_ID: 'cecon',
        AGENTMEMORY_AGENT_ID: 'opencode',
        AGENTMEMORY_TIMEOUT_MS: '200',
      },
    }),
    healthCacheMs: 0,
    ...overrides,
  };
}

function requestsTo(fetchMock: ReturnType<typeof vi.fn>, path: string) {
  return fetchMock.mock.calls.filter((call) => String(call[0]).endsWith(path));
}

function bodyOf(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('disabled', () => {
  it('routes every call to the noop provider and never touches the network', async () => {
    const provider = createMemoryProvider({ getConfig: () => config({ enabled: false }) });
    expect(provider.name).toBe('noop');
    expect(await provider.status()).toBe('disabled');
    expect(await provider.health()).toBe(false);
    expect(await provider.recall({ query: 'anything' })).toEqual([]);
    expect(await provider.remember({ content: 'x' })).toMatchObject({
      ok: false,
      reason: 'disabled',
    });
    expect(await provider.share('mem_1')).toBe(false);
    expect(await provider.forget('mem_1')).toBe(false);
    expect(await provider.recallContext({ query: 'anything' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('switches at runtime when the config flips', async () => {
    let enabled = false;
    const provider = createMemoryProvider({ getConfig: () => config({ enabled }) });
    expect(provider.name).toBe('noop');
    enabled = true;
    expect(provider.name).toBe('agentmemory');
  });
});

describe('unavailable', () => {
  it('reports unavailable, warns once, and keeps the application running', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = createMemoryProvider({ getConfig: () => config() });

    expect(await provider.status()).toBe('unavailable');
    expect(await provider.recall({ query: 'ack duplicado' })).toEqual([]);
    expect(await provider.remember({ content: 'fact' })).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
    expect(await provider.share('mem_1')).toBe(false);
    expect(await provider.recallContext({ query: 'x' })).toBeNull();

    const unavailableWarnings = (console.warn as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes('[memory] unavailable'),
    );
    expect(unavailableWarnings).toHaveLength(1);
  });

  it('times out slow servers instead of hanging the caller', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const provider = createMemoryProvider({ getConfig: () => config({ timeoutMs: 100 }) });
    const started = Date.now();
    expect(await provider.recall({ query: 'slow' })).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('treats an authentication error as a failed call, not a crash', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
    const provider = createMemoryProvider({ getConfig: () => config({ secret: 'wrong' }) });
    expect(await provider.remember({ content: 'fact' })).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
    expect(await provider.recall({ query: 'q' })).toEqual([]);
    expect(await provider.forget('mem_1')).toBe(false);
  });
});

describe('remember', () => {
  it('stores a private memory with identity and provenance tags and returns its id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, memory: { id: 'mem_42' } }, 201));
    const provider = createMemoryProvider({ getConfig: () => config() });

    const result = await provider.remember({
      content: 'The supplier can send a duplicated ACK. Consumers must be idempotent.',
      kind: 'integration_behavior',
      confidence: 'confirmed',
      source: 'developer',
      concepts: ['ack'],
      files: ['src/ack.ts'],
      provenance: { repository: 'kodra', branch: 'main', commit: 'abcdef1234567890' },
    });

    expect(result).toEqual({ ok: true, memoryId: 'mem_42', scope: 'private' });
    const [call] = requestsTo(fetchMock, '/agentmemory/remember');
    const init = call![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer top-secret');
    const body = bodyOf(call!);
    expect(body).toMatchObject({
      type: 'fact',
      project: 'kodra',
      agentId: 'opencode',
      files: ['src/ack.ts'],
    });
    expect(body.concepts).toEqual(
      expect.arrayContaining([
        'ack',
        'scope:private',
        'kind:integration_behavior',
        'confidence:confirmed',
        'source:developer',
        'user:cecon',
        'team:platform',
        'agent:opencode',
        'repo:kodra',
        'branch:main',
        'commit:abcdef123456',
      ]),
    );
  });

  it('never retries a write (no idempotency key on the server)', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    const provider = createMemoryProvider({ getConfig: () => config() });
    await provider.remember({ content: 'once' });
    expect(requestsTo(fetchMock, '/agentmemory/remember')).toHaveLength(1);
  });

  it('refuses content that looks like a credential', async () => {
    const provider = createMemoryProvider({ getConfig: () => config() });
    const result = await provider.remember({ content: 'use AGENTMEMORY_SECRET=0123456789abcdef' });
    expect(result).toMatchObject({ ok: false, reason: 'rejected_credentials' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives temporary context a TTL and maps kinds onto AgentMemory types', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, memory: { id: 'mem_1' } }, 201));
    const provider = createMemoryProvider({ getConfig: () => config() });
    await provider.remember({ content: 'investigating flaky ACK', kind: 'temporary_context' });
    await provider.remember({ content: 'we chose SSE', kind: 'architecture_decision' });
    const calls = requestsTo(fetchMock, '/agentmemory/remember');
    expect(bodyOf(calls[0]!)).toMatchObject({ type: 'fact', ttlDays: 7 });
    expect(bodyOf(calls[1]!)).toMatchObject({ type: 'architecture' });
    expect(bodyOf(calls[1]!).ttlDays).toBeUndefined();
  });

  it('surfaces near-duplicates reported by the server', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: true, memory: { id: 'mem_2' }, similarTo: { id: 'mem_1', similarity: 0.6 } },
        201,
      ),
    );
    const provider = createMemoryProvider({ getConfig: () => config() });
    expect(await provider.remember({ content: 'almost the same fact' })).toMatchObject({
      ok: true,
      memoryId: 'mem_2',
      similarTo: 'mem_1',
    });
  });
});

describe('recall', () => {
  function serve(routes: Record<string, unknown>) {
    fetchMock.mockImplementation((url: string) => {
      for (const [path, value] of Object.entries(routes)) {
        if (String(url).includes(path)) return Promise.resolve(jsonResponse(value));
      }
      return Promise.resolve(jsonResponse({ error: 'not found' }, 404));
    });
  }

  it('merges team knowledge first, then private hits, deduplicated and capped', async () => {
    serve({
      '/agentmemory/smart-search': {
        results: [
          {
            obsId: 'obs_1',
            title: 'ACK retry loop observed in worker',
            type: 'bug',
            score: 0.8,
            timestamp: '2026-05-01T00:00:00Z',
          },
          {
            obsId: 'obs_2',
            title: 'Consumers must be idempotent on ACK',
            type: 'fact',
            score: 0.7,
          },
          { obsId: 'obs_3', title: 'Unrelated font licensing note', type: 'fact', score: 0.1 },
        ],
      },
      '/agentmemory/team/feed': {
        items: [
          {
            id: 'ts_1',
            content: 'Consumers must be idempotent on ACK',
            type: 'memory',
            project: 'kodra',
            sharedBy: 'ana',
            sharedAt: '2026-04-01T00:00:00Z',
            visibility: 'shared',
          },
          {
            id: 'ts_2',
            content: 'Other project note about ACK',
            type: 'memory',
            project: 'other',
            sharedBy: 'ana',
            sharedAt: '2026-04-02T00:00:00Z',
            visibility: 'shared',
          },
          {
            id: 'ts_3',
            content: 'Deploy on Fridays is fine',
            type: 'memory',
            project: 'kodra',
            sharedBy: 'bob',
            sharedAt: '2026-04-03T00:00:00Z',
            visibility: 'shared',
          },
        ],
        total: 3,
      },
    });
    const provider = createMemoryProvider({ getConfig: () => config() });

    const records = await provider.recall({ query: 'duplicated ACK idempotent', limit: 3 });
    expect(records.map((r) => [r.scope, r.id])).toEqual([
      ['team', 'ts_1'],
      ['private', 'obs_1'],
      ['private', 'obs_3'],
    ]);
    expect(records[0]).toMatchObject({ sharedBy: 'ana', project: 'kodra' });

    const [search] = requestsTo(fetchMock, '/agentmemory/smart-search');
    expect(bodyOf(search!)).toMatchObject({
      query: 'duplicated ACK idempotent',
      limit: 3,
      project: 'kodra',
      agentId: 'opencode',
    });
    expect((search![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer top-secret',
    });
  });

  it('reads the real team/share shape where content is the copied memory record', async () => {
    serve({
      '/agentmemory/smart-search': { results: [] },
      '/agentmemory/team/feed': {
        items: [
          {
            id: 'ts_real',
            type: 'memory',
            project: 'kodra',
            sharedBy: 'cecon',
            sharedAt: '2026-09-14T15:44:50.000Z',
            visibility: 'shared',
            content: {
              id: 'mem_1',
              content:
                'O fornecedor pode enviar ACK duplicado. Consumidores precisam ser idempotentes.',
              type: 'fact',
              project: 'kodra',
              concepts: ['kind:integration_behavior'],
            },
          },
        ],
        total: 1,
      },
    });
    const provider = createMemoryProvider({ getConfig: () => config() });
    const records = await provider.recall({ query: 'ACK duplicado idempotente' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'ts_real',
      scope: 'team',
      type: 'fact',
      sharedBy: 'cecon',
      project: 'kodra',
    });
    expect(records[0]!.content).toContain('ACK duplicado');
  });

  it('skips the team feed when no team is configured', async () => {
    serve({ '/agentmemory/smart-search': { results: [] } });
    const provider = createMemoryProvider({ getConfig: () => config({ teamId: null }) });
    await provider.recall({ query: 'anything' });
    expect(requestsTo(fetchMock, '/agentmemory/team/feed')).toHaveLength(0);
  });

  it('builds a bounded context block from the recall', async () => {
    serve({
      '/agentmemory/smart-search': {
        results: Array.from({ length: 30 }, (_, i) => ({
          obsId: `obs_${i}`,
          title: `memory number ${i} ${'detail '.repeat(40)}`,
          type: 'fact',
          score: 1 - i / 100,
        })),
      },
      '/agentmemory/team/feed': { items: [], total: 0 },
    });
    const provider = createMemoryProvider({
      getConfig: () => config({ maxContextItems: 4, maxContextChars: 900 }),
    });
    const block = await provider.recallContext({ query: 'memory number' });
    expect(block).not.toBeNull();
    expect(block!.length).toBeLessThanOrEqual(900);
    expect(block!.split('\n').filter((l) => l.startsWith('- ')).length).toBeLessThanOrEqual(4);
  });

  it('keeps identities separate: each provider instance carries its own user and agent', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, memory: { id: 'mem_x' } }, 201));
    const ana = createMemoryProvider({
      getConfig: () => config({ userId: 'ana', agentId: 'claude-code' }),
    });
    const bob = createMemoryProvider({
      getConfig: () => config({ userId: 'bob', agentId: 'opencode', project: 'other' }),
    });
    await ana.remember({ content: 'from ana' });
    await bob.remember({ content: 'from bob' });
    const calls = requestsTo(fetchMock, '/agentmemory/remember');
    expect(bodyOf(calls[0]!)).toMatchObject({ agentId: 'claude-code', project: 'kodra' });
    expect(bodyOf(calls[0]!).concepts).toEqual(
      expect.arrayContaining(['user:ana', 'agent:claude-code']),
    );
    expect(bodyOf(calls[1]!)).toMatchObject({ agentId: 'opencode', project: 'other' });
    expect(bodyOf(calls[1]!).concepts).toEqual(
      expect.arrayContaining(['user:bob', 'agent:opencode']),
    );
    expect(bodyOf(calls[1]!).concepts).not.toEqual(expect.arrayContaining(['user:ana']));
  });
});

describe('share and forget', () => {
  it('promotes a private memory to the team feed through team/share', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, sharedItem: { id: 'ts_9' } }, 201));
    const provider = createMemoryProvider({ getConfig: () => config() });
    expect(await provider.share('mem_42')).toBe(true);
    const [call] = requestsTo(fetchMock, '/agentmemory/team/share');
    expect(bodyOf(call!)).toEqual({ itemId: 'mem_42', itemType: 'memory', project: 'kodra' });
  });

  it('refuses to share when no team is configured', async () => {
    const provider = createMemoryProvider({ getConfig: () => config({ teamId: null }) });
    expect(await provider.share('mem_42')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forgets by memory id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ deleted: 1 }));
    const provider = createMemoryProvider({ getConfig: () => config() });
    expect(await provider.forget('mem_42')).toBe(true);
    const [call] = requestsTo(fetchMock, '/agentmemory/forget');
    expect(bodyOf(call!)).toEqual({ memoryId: 'mem_42' });
  });
});

describe('health', () => {
  it('caches the probe for the configured window', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));
    let t = 1000;
    const provider = createMemoryProvider({
      getConfig: () => config({ healthCacheMs: 30_000 }),
      now: () => t,
    });
    expect(await provider.status()).toBe('healthy');
    expect(await provider.status()).toBe('healthy');
    expect(requestsTo(fetchMock, '/agentmemory/livez')).toHaveLength(1);
    t += 31_000;
    await provider.status();
    expect(requestsTo(fetchMock, '/agentmemory/livez')).toHaveLength(2);
  });
});
