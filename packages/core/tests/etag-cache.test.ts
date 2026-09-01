import { openStoreInMemory, type Store } from '@kanbots/local-store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitHubClient } from '../src/github-client.js';
import { FakeFetch } from './helpers/fake-fetch.js';
import { issueFixture } from './helpers/fixtures.js';

describe('ETag cache', () => {
  let fetcher: FakeFetch;
  let store: Store;
  let client: GitHubClient;

  beforeEach(() => {
    fetcher = new FakeFetch();
    store = openStoreInMemory();
    client = new GitHubClient({
      owner: 'octo',
      repo: 'hello',
      token: 'tok',
      fetch: fetcher.fetch,
      cache: store.httpCache,
    });
  });

  afterEach(() => {
    store.close();
  });

  it('stores ETag from first 200 response', async () => {
    fetcher.enqueue({
      status: 200,
      body: [issueFixture(1, 'first')],
      headers: { etag: 'W/"abc"' },
    });
    await client.listIssues();

    const all = store.db.prepare('SELECT * FROM http_cache').all() as Array<{
      key: string;
      etag: string | null;
      body: string;
    }>;
    const issuesEntry = all.find((e) => e.key.includes('/issues'));
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

    const all = store.db.prepare('SELECT * FROM http_cache').all() as Array<{
      key: string;
      etag: string | null;
    }>;
    const issuesEntry = all.find((e) => e.key.includes('/issues'));
    expect(issuesEntry?.etag).toBe('W/"v2"');
  });

  it('does not cache POST responses', async () => {
    fetcher.enqueue({
      status: 201,
      body: issueFixture(1, 'created'),
      headers: { etag: 'W/"x"' },
    });
    await client.createIssue({ title: 'created' });

    const all = store.db.prepare('SELECT * FROM http_cache').all() as Array<{ key: string }>;
    expect(all).toHaveLength(0);
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

    const all = store.db.prepare('SELECT key FROM http_cache ORDER BY key').all() as {
      key: string;
    }[];
    expect(all).toHaveLength(2);
  });
});
