import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentMemoryClient,
  memoryNamespace,
  memorySessionId,
} from '../../src/memory/client.js';

const baseUrl = 'http://localhost:3111';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('agentmemory client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses unauthenticated livez for health and degrades on failures', async () => {
    const client = createAgentMemoryClient({ baseUrl, secret: 'token' });
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }, 200));
    expect(await client.health()).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/agentmemory/livez`);
    expect(fetchMock.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization');

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    expect(await client.health()).toBe(false);

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await client.health()).toBe(false);

    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('timed out')));
        }),
    );
    expect(await createAgentMemoryClient({ baseUrl, timeoutMs: 1 }).health()).toBe(false);
  });

  it('reads version from config flags and returns null for unsupported shapes', async () => {
    const client = createAgentMemoryClient({ baseUrl });
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: '0.9.29', flags: [] }));
    expect(await client.version()).toBe('0.9.29');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/agentmemory/config/flags`);

    fetchMock.mockResolvedValueOnce(jsonResponse('0.9.30'));
    expect(await client.version()).toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ service: { version: '0.9.31' } }));
    expect(await client.version()).toBe('0.9.31');

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await client.version()).toBeNull();
  });

  it('maps smart-search project/limit fields and result hits', async () => {
    const client = createAgentMemoryClient({ baseUrl });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        mode: 'compact',
        results: [{ obsId: 'a', title: 't', score: 0.9, sessionId: 's' }],
        lessons: [],
      }),
    );

    const hits = await client.smartSearch({
      query: 'remember',
      namespace: 'kanbots:w:r',
      sessionId: 's',
      topK: 5,
    });
    expect(hits[0]).toMatchObject({ id: 'a', content: 't', score: 0.9, sessionId: 's' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/agentmemory/smart-search`);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      query: 'remember',
      limit: 5,
      project: 'kanbots:w:r',
      sessionId: 's',
      includeLessons: true,
    });
    expect(body).not.toHaveProperty('topK');
    expect(body).not.toHaveProperty('namespace');

    fetchMock.mockResolvedValueOnce(jsonResponse([{ obsId: 'b', type: 'observation' }]));
    expect(await client.smartSearch({ query: 'fallback' })).toMatchObject([
      { id: 'b', content: 'observation' },
    ]);

    fetchMock.mockResolvedValueOnce(jsonResponse({ mode: 'compact', lessons: [] }));
    expect(await client.smartSearch({ query: 'missing' })).toEqual([]);
  });

  it('lists sessions and computes content presence client-side', async () => {
    const client = createAgentMemoryClient({ baseUrl, secret: 'token' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ sessions: [{ id: 's1', observationCount: 5, summary: {} }] }),
    );
    expect(await client.getSession('s1')).toEqual({ hasContent: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/agentmemory/sessions`);

    fetchMock.mockResolvedValueOnce(jsonResponse({ sessions: [{ id: 's1', observationCount: 5 }] }));
    expect(await client.getSession('missing')).toBeNull();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ sessions: [{ id: 'empty', observationCount: 0, summary: null }] }),
    );
    expect(await client.getSession('empty')).toEqual({ hasContent: false });

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await client.getSession('offline')).toBeNull();
  });

  it('posts memories to remember with the corrected field names', async () => {
    const client = createAgentMemoryClient({ baseUrl });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'memory-1' }, 201));
    expect(
      await client.save({
        content: 'a decision',
        kind: 'decision',
        namespace: 'kanbots:w:r',
        metadata: { concepts: ['testing'], files: ['client.ts'] },
      }),
    ).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/agentmemory/remember`);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toEqual({
      content: 'a decision',
      type: 'decision',
      project: 'kanbots:w:r',
      concepts: ['testing'],
      files: ['client.ts'],
    });

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await client.save({ content: 'another memory' })).toBe(false);
  });

  it('starts agentmemory sessions with the lifecycle payload and degrades on failures', async () => {
    const client = createAgentMemoryClient({ baseUrl, secret: 'token' });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 200));
    await expect(
      client.sessionStart({
        sessionId: 'kodra-12',
        project: 'kanbots:w:r',
        cwd: '/tmp/worktree',
        title: 'Implement lifecycle',
        agentId: 'claude-code',
      }),
    ).resolves.toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/agentmemory/session/start`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toEqual({
      sessionId: 'kodra-12',
      project: 'kanbots:w:r',
      cwd: '/tmp/worktree',
      title: 'Implement lifecycle',
      agentId: 'claude-code',
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(
      client.sessionStart({ sessionId: 'kodra-13', project: 'p', cwd: '/tmp' }),
    ).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(
      client.sessionStart({ sessionId: 'kodra-14', project: 'p', cwd: '/tmp' }),
    ).resolves.toBe(false);
  });

  it('observes agentmemory hooks with an ISO timestamp and degrades on failures', async () => {
    const client = createAgentMemoryClient({ baseUrl, secret: 'token' });
    const timestamp = '2026-09-11T12:34:56.000Z';

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 200));
    await expect(
      client.observe({
        hookType: 'agent_run_started',
        sessionId: 'kodra-12',
        project: 'kanbots:w:r',
        cwd: '/tmp/worktree',
        timestamp,
        data: { runId: 3 },
      }),
    ).resolves.toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/agentmemory/observe`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toEqual({
      hookType: 'agent_run_started',
      sessionId: 'kodra-12',
      project: 'kanbots:w:r',
      cwd: '/tmp/worktree',
      timestamp,
      data: { runId: 3 },
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(
      client.observe({ hookType: 'run_failed', sessionId: 'kodra-12', project: 'p', cwd: '/tmp' }),
    ).resolves.toBe(false);
  });

  it('ends agentmemory sessions and degrades on failures', async () => {
    const client = createAgentMemoryClient({ baseUrl, secret: 'token' });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 200));
    await expect(client.sessionEnd('kodra-12')).resolves.toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/agentmemory/session/end`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toEqual({
      sessionId: 'kodra-12',
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(client.sessionEnd('kodra-13')).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(client.sessionEnd('kodra-14')).resolves.toBe(false);
  });

  it('sends bearer auth on every endpoint except livez', async () => {
    const client = createAgentMemoryClient({ baseUrl, secret: 'token' });
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/livez')) return Promise.resolve(jsonResponse({ status: 'ok' }));
      if (url.endsWith('/config/flags')) return Promise.resolve(jsonResponse({ version: 'x' }));
      if (url.endsWith('/smart-search')) return Promise.resolve(jsonResponse({ results: [] }));
      if (url.endsWith('/sessions')) return Promise.resolve(jsonResponse({ sessions: [] }));
      return Promise.resolve(jsonResponse({}, 201));
    });

    await client.health();
    await client.version();
    await client.smartSearch({ query: 'x' });
    await client.getSession('x');
    await client.save({ content: 'x' });
    await client.sessionStart({ sessionId: 's', project: 'p', cwd: '/tmp' });
    await client.observe({ hookType: 'x', sessionId: 's', project: 'p', cwd: '/tmp' });
    await client.sessionEnd('s');

    for (const [url, options] of fetchMock.mock.calls) {
      if (url.endsWith('/livez')) {
        expect(options.headers).not.toHaveProperty('Authorization');
      } else {
        expect(options.headers).toMatchObject({ Authorization: 'Bearer token' });
      }
    }
  });

  it('never throws when every request rejects', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const client = createAgentMemoryClient({ baseUrl });

    await expect(client.health()).resolves.toBe(false);
    await expect(client.version()).resolves.toBeNull();
    await expect(client.smartSearch({ query: 'x' })).resolves.toEqual([]);
    await expect(client.getSession('x')).resolves.toBeNull();
    await expect(client.save({ content: 'x' })).resolves.toBe(false);
    await expect(client.sessionStart({ sessionId: 's', project: 'p', cwd: '/tmp' })).resolves.toBe(false);
    await expect(client.observe({ hookType: 'x', sessionId: 's', project: 'p', cwd: '/tmp' })).resolves.toBe(false);
    await expect(client.sessionEnd('s')).resolves.toBe(false);
  });

  it('builds the ADR-0004 memory scopes', () => {
    expect(memoryNamespace({ workspaceId: 'w', repoId: 'r' })).toBe('kanbots:w:r');
    expect(
      memorySessionId({ workspaceId: 'w', repoId: 'r', issueNumber: 7, runId: 3 }),
    ).toBe('kanbots:w:r:7:3');
  });
});
