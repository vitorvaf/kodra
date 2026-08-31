import { beforeEach, describe, expect, it } from 'vitest';
import type { CacheEntry, ETagCache, SetCacheInput } from '../src/etag-cache.js';
import { GitHubClient } from '../src/github-client.js';
import { FakeFetch } from './helpers/fake-fetch.js';
import { issueFixture } from './helpers/fixtures.js';

/**
 * In-memory ETagCache. The production cache lives in @kanbots/local-store
 * (http_cache table); keeping this test on a local fake avoids a workspace
 * dev-dependency core → local-store, which created a build-graph cycle and
 * broke `pnpm -r build` ordering (local-store's dts build could resolve core
 * types from a stale core/dist mid-rebuild).
 */
class MemoryCache implements ETagCache {
  private readonly map = new Map<string, CacheEntry>();

  get(key: string): CacheEntry | null {
    return this.map.get(key) ?? null;
  }

  set(input: SetCacheInput): void {
    this.map.set(input.key, {
      etag: input.etag ?? null,
      lastModified: input.lastModified ?? null,
      body: input.body,
    });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  entries(): Array<[string, CacheEntry]> {
    return [...this.map.entries()];
  }

  keys(): string[] {
    return [...this.map.keys()].sort();
  }
}

describe('ETag cache', () => {
  let fetcher: FakeFetch;
  let cache: MemoryCache;
  let client: GitHubClient;

  beforeEach(() => {
    fetcher = new FakeFetch();
    cache = new MemoryCache();
    client = new GitHubClient({
      owner: 'octo',
      repo: 'hello',
      token: 'tok',
      fetch: fetcher.fetch,
      cache,
    });
  });

  it('stores ETag from first 200 response', async () => {
    fetcher.enqueue({
      status: 200,
      body: [issueFixture(1, 'first')],
      headers: { etag: 'W/"abc"' },
    });
    await client.listIssues();

    const issuesEntry = cache.entries().find(([key]) => key.includes('/issues'))?.[1];
    expect(issuesEntry).toBeDefined();
    expect(issuesEntry?.etag).toBe('W/"abc"');
  });

  it('sends If-None-Match on second call and returns cached data on 304', async () => {
    fetcher.enqueue({
      status: 200,
      body: [issueFixture(1, 'first'), issueFixture(2, 'second')],
      headers: { etag: 'W/"v1"' },
    });
    const first = await client.listIssues();
    expect(first).toHaveLength(2);
    expect(first[0]?.title).toBe('first');

    fetcher.enqueue({ status: 304, headers: { etag: 'W/"v1"' } });
    const second = await client.listIssues();
    expect(second).toHaveLength(2);
    expect(second[0]?.title).toBe('first');
    expect(second[1]?.title).toBe('second');

    expect(fetcher.calls).toHaveLength(2);
    expect(fetcher.calls[1]?.headers['if-none-match']).toBe('W/"v1"');
  });

  it('updates cached body and ETag when server returns new data', async () => {
    fetcher.enqueue({
      status: 200,
      body: [issueFixture(1, 'old')],
      headers: { etag: 'W/"v1"' },
    });
    await client.listIssues();

    fetcher.enqueue({
      status: 200,
      body: [issueFixture(1, 'new')],
      headers: { etag: 'W/"v2"' },
    });
    const second = await client.listIssues();
    expect(second[0]?.title).toBe('new');

    const issuesEntry = cache.entries().find(([key]) => key.includes('/issues'))?.[1];
    expect(issuesEntry?.etag).toBe('W/"v2"');
  });

  it('does not cache POST responses', async () => {
    fetcher.enqueue({
      status: 201,
      body: issueFixture(1, 'created'),
      headers: { etag: 'W/"x"' },
    });
    await client.createIssue({ title: 'created' });

    expect(cache.entries()).toHaveLength(0);
  });

  it('separately caches getIssue and listIssues by URL', async () => {
    fetcher.enqueue({
      status: 200,
      body: [issueFixture(1, 'list')],
      headers: { etag: 'W/"list"' },
    });
    await client.listIssues();

    fetcher.enqueue({
      status: 200,
      body: issueFixture(1, 'one'),
      headers: { etag: 'W/"one"' },
    });
    await client.getIssue(1);

    expect(cache.keys()).toHaveLength(2);
  });
});
