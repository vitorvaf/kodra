import { beforeEach, describe, expect, it } from 'vitest';
import { GitHubClient } from '../src/github-client.js';
import { FakeFetch } from './helpers/fake-fetch.js';
import { commentFixture, issueFixture, pullFixture } from './helpers/fixtures.js';

describe('GitHubClient', () => {
  let fetcher: FakeFetch;
  let client: GitHubClient;

  beforeEach(() => {
    fetcher = new FakeFetch();
    client = new GitHubClient({
      owner: 'octo',
      repo: 'hello',
      token: 'gh_test_token',
      fetch: fetcher.fetch,
    });
  });

  describe('listIssues', () => {
    it('fetches and parses', async () => {
      fetcher.enqueue({
        status: 200,
        body: [issueFixture(1, 'first'), issueFixture(2, 'second')],
        headers: { etag: 'W/"abc"' },
      });
      const issues = await client.listIssues();
      expect(issues).toHaveLength(2);
      expect(issues[0]?.number).toBe(1);
      expect(issues[0]?.title).toBe('first');
      expect(issues[1]?.title).toBe('second');
    });

    it('passes state filter', async () => {
      fetcher.enqueue({ status: 200, body: [] });
      await client.listIssues({ state: 'closed' });
      expect(fetcher.calls[0]?.url).toContain('state=closed');
    });

    it('defaults to open state', async () => {
      fetcher.enqueue({ status: 200, body: [] });
      await client.listIssues();
      expect(fetcher.calls[0]?.url).toContain('state=open');
    });

    it('sends authorization header', async () => {
      fetcher.enqueue({ status: 200, body: [] });
      await client.listIssues();
      const auth = fetcher.calls[0]?.headers['authorization'];
      expect(auth).toBeDefined();
      expect(auth).toMatch(/gh_test_token/);
    });

    it('flags pull requests', async () => {
      fetcher.enqueue({
        status: 200,
        body: [
          issueFixture(1, 'plain'),
          issueFixture(2, 'pr', { pull_request: { url: 'https://...' } }),
        ],
      });
      const issues = await client.listIssues();
      expect(issues[0]?.isPullRequest).toBe(false);
      expect(issues[1]?.isPullRequest).toBe(true);
    });

    it('extracts label names regardless of label shape', async () => {
      fetcher.enqueue({
        status: 200,
        body: [
          issueFixture(1, 'x', {
            labels: ['plain-string', { name: 'object-shape' }, { name: null }],
          }),
        ],
      });
      const issues = await client.listIssues();
      expect(issues[0]?.labels).toEqual(['plain-string', 'object-shape']);
    });
  });

  describe('getRepo', () => {
    it('fetches and maps the repo', async () => {
      fetcher.enqueue({
        status: 200,
        body: {
          owner: { login: 'octo' },
          name: 'hello',
          default_branch: 'main',
          private: false,
          html_url: 'https://github.com/octo/hello',
        },
      });
      const repo = await client.getRepo();
      expect(repo.owner).toBe('octo');
      expect(repo.name).toBe('hello');
      expect(repo.defaultBranch).toBe('main');
      expect(repo.private).toBe(false);
      expect(fetcher.calls[0]?.url).toContain('/repos/octo/hello');
    });

    it('propagates 401', async () => {
      fetcher.enqueue({ status: 401, body: { message: 'Bad credentials' } });
      await expect(client.getRepo()).rejects.toMatchObject({ status: 401 });
    });

    it('propagates 404', async () => {
      fetcher.enqueue({ status: 404, body: { message: 'Not Found' } });
      await expect(client.getRepo()).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getIssue', () => {
    it('fetches one', async () => {
      fetcher.enqueue({ status: 200, body: issueFixture(7, 'lucky') });
      const issue = await client.getIssue(7);
      expect(issue.number).toBe(7);
      expect(issue.title).toBe('lucky');
    });

    it('targets the right URL', async () => {
      fetcher.enqueue({ status: 200, body: issueFixture(42, 'meaning') });
      await client.getIssue(42);
      expect(fetcher.calls[0]?.url).toContain('/repos/octo/hello/issues/42');
    });
  });

  describe('createIssue', () => {
    it('POSTs and returns the created issue', async () => {
      fetcher.enqueue({ status: 201, body: issueFixture(99, 'new one') });
      const issue = await client.createIssue({
        title: 'new one',
        body: 'description',
        labels: ['status:todo'],
      });
      expect(issue.number).toBe(99);

      const call = fetcher.calls[0];
      expect(call?.method).toBe('POST');
      expect(call?.url).toContain('/repos/octo/hello/issues');
      const body = JSON.parse(call?.body ?? '{}') as { title: string; body: string; labels: string[] };
      expect(body.title).toBe('new one');
      expect(body.body).toBe('description');
      expect(body.labels).toEqual(['status:todo']);
    });
  });

  describe('updateIssue', () => {
    it('PATCHes', async () => {
      fetcher.enqueue({ status: 200, body: issueFixture(5, 'updated') });
      await client.updateIssue(5, { state: 'closed', labels: ['status:done'] });
      const call = fetcher.calls[0];
      expect(call?.method).toBe('PATCH');
      expect(call?.url).toContain('/repos/octo/hello/issues/5');
      const body = JSON.parse(call?.body ?? '{}') as { state: string; labels: string[] };
      expect(body.state).toBe('closed');
      expect(body.labels).toEqual(['status:done']);
    });
  });

  describe('setLabels', () => {
    it('PUTs the label list', async () => {
      fetcher.enqueue({ status: 200, body: [] });
      await client.setLabels(3, ['status:in-progress', 'agent:running']);
      const call = fetcher.calls[0];
      expect(call?.method).toBe('PUT');
      expect(call?.url).toContain('/repos/octo/hello/issues/3/labels');
      const body = JSON.parse(call?.body ?? '{}') as { labels: string[] };
      expect(body.labels).toEqual(['status:in-progress', 'agent:running']);
    });
  });

  describe('addComment', () => {
    it('POSTs and returns the created comment', async () => {
      fetcher.enqueue({ status: 201, body: commentFixture(123, 'hello world') });
      const c = await client.addComment(1, 'hello world');
      expect(c.id).toBe(123);
      expect(c.body).toBe('hello world');
      expect(c.user.login).toBe('tester');
    });
  });

  describe('listComments', () => {
    it('lists', async () => {
      fetcher.enqueue({
        status: 200,
        body: [commentFixture(1, 'first'), commentFixture(2, 'second')],
      });
      const cs = await client.listComments(1);
      expect(cs).toHaveLength(2);
      expect(cs[0]?.body).toBe('first');
    });
  });

  describe('openDraftPR', () => {
    it('POSTs to /pulls with draft=true by default and prepends Closes #N', async () => {
      fetcher.enqueue({ status: 201, body: pullFixture(87, 'fix: middleware') });
      const pr = await client.openDraftPR({
        title: 'fix: middleware',
        body: 'Some details',
        head: 'agent/issue-87',
        issueNumber: 87,
      });
      expect(pr.number).toBe(87);
      expect(pr.draft).toBe(true);

      const call = fetcher.calls[0];
      expect(call?.method).toBe('POST');
      expect(call?.url).toContain('/repos/octo/hello/pulls');
      const body = JSON.parse(call?.body ?? '{}') as {
        body: string;
        head: string;
        base: string;
        draft: boolean;
      };
      expect(body.body.startsWith('Closes #87')).toBe(true);
      expect(body.head).toBe('agent/issue-87');
      expect(body.base).toBe('main');
      expect(body.draft).toBe(true);
    });
  });
});
