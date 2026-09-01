import { beforeEach, describe, expect, it } from 'vitest';
import { GitHubClient } from '../src/github-client.js';
import { ALL_KANBOTS_LABELS } from '../src/labels.js';
import { FakeFetch } from './helpers/fake-fetch.js';
import { labelFixture } from './helpers/fixtures.js';

describe('ensureLabels', () => {
  let fetcher: FakeFetch;
  let client: GitHubClient;

  beforeEach(() => {
    fetcher = new FakeFetch();
    client = new GitHubClient({
      owner: 'octo',
      repo: 'hello',
      token: 'tok',
      fetch: fetcher.fetch,
    });
  });

  it('creates missing labels and skips existing ones', async () => {
    for (let i = 0; i < ALL_KANBOTS_LABELS.length; i++) {
      const label = ALL_KANBOTS_LABELS[i];
      if (!label) continue;
      const exists = i % 2 === 0;
      if (exists) {
        fetcher.enqueue({ status: 200, body: labelFixture(label.name) });
      } else {
        fetcher.enqueue({ status: 404, body: { message: 'Not Found' } });
        fetcher.enqueue({ status: 201, body: labelFixture(label.name, label.color) });
      }
    }

    await client.ensureLabels();

    const expectedMissing = ALL_KANBOTS_LABELS.filter((_, i) => i % 2 !== 0);
    const posts = fetcher.calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(expectedMissing.length);

    for (const post of posts) {
      const body = JSON.parse(post.body ?? '{}') as { name: string };
      expect(expectedMissing.map((l) => l.name)).toContain(body.name);
    }
  });

  it('creates all labels on a fresh repo', async () => {
    for (const label of ALL_KANBOTS_LABELS) {
      fetcher.enqueue({ status: 404, body: { message: 'Not Found' } });
      fetcher.enqueue({ status: 201, body: labelFixture(label.name, label.color) });
    }

    await client.ensureLabels();

    const posts = fetcher.calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(ALL_KANBOTS_LABELS.length);
  });

  it('makes no POST when all labels exist', async () => {
    for (const label of ALL_KANBOTS_LABELS) {
      fetcher.enqueue({ status: 200, body: labelFixture(label.name) });
    }

    await client.ensureLabels();

    const posts = fetcher.calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('rethrows non-404 errors', async () => {
    fetcher.enqueue({ status: 500, body: { message: 'oops' } });
    await expect(client.ensureLabels()).rejects.toThrow();
  });
});
