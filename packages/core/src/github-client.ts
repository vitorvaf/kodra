import { Octokit as Core } from '@octokit/core';
import { paginateRest } from '@octokit/plugin-paginate-rest';
import { RequestError } from '@octokit/request-error';
import type { ETagCache } from './etag-cache.js';
import type { IssueSource } from './issue-source.js';
import { ALL_KANBOTS_LABELS } from './labels.js';
import {
  rawCommentToComment,
  rawIssueToIssue,
  rawPullToPullRequest,
  rawReviewCommentToReviewComment,
  type RawComment,
  type RawIssue,
  type RawPullRequest,
  type RawPullRequestReviewComment,
} from './mappers.js';
import type {
  Comment,
  CreateIssueInput,
  Issue,
  OpenPRInput,
  PullRequest,
  PullRequestReviewComment,
  Repo,
  UpdateIssuePatch,
} from './types.js';

const Octokit = Core.plugin(paginateRest);

interface CachedPayload {
  data: unknown;
  link: string | null;
}

export interface GitHubClientOptions {
  owner: string;
  repo: string;
  token: string;
  cache?: ETagCache;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class GitHubClient implements IssueSource {
  readonly owner: string;
  readonly repo: string;
  private readonly octokit: InstanceType<typeof Octokit>;
  private readonly cache: ETagCache | null;

  constructor(opts: GitHubClientOptions) {
    this.owner = opts.owner;
    this.repo = opts.repo;
    this.cache = opts.cache ?? null;

    this.octokit = new Octokit({
      auth: opts.token,
      baseUrl: opts.baseUrl ?? 'https://api.github.com',
      ...(opts.fetch ? { request: { fetch: opts.fetch } } : {}),
    });

    if (this.cache) {
      this.installCacheHook(this.cache);
    }
  }

  private installCacheHook(cache: ETagCache): void {
    this.octokit.hook.wrap('request', async (request, options) => {
      if (options.method !== 'GET') {
        return await request(options);
      }

      const cacheKey = `${options.method} ${options.url}`;
      const cached = cache.get(cacheKey);

      if (cached?.etag) {
        options.headers = { ...options.headers, 'if-none-match': cached.etag };
      }
      if (cached?.lastModified) {
        options.headers = { ...options.headers, 'if-modified-since': cached.lastModified };
      }

      try {
        const response = await request(options);
        const headers = response.headers as Record<string, string | undefined>;
        const etag = headers.etag ?? null;
        const lastModified = headers['last-modified'] ?? null;
        const link = headers.link ?? null;
        if (etag || lastModified) {
          const payload: CachedPayload = { data: response.data, link };
          cache.set({
            key: cacheKey,
            body: JSON.stringify(payload),
            etag,
            lastModified,
          });
        }
        return response;
      } catch (err) {
        if (isRequestError(err) && err.status === 304 && cached) {
          const parsed = JSON.parse(cached.body) as CachedPayload;
          const headers: Record<string, string> = {};
          if (parsed.link) headers.link = parsed.link;
          return {
            status: 304,
            url: typeof options.url === 'string' ? options.url : '',
            headers,
            data: parsed.data,
          };
        }
        throw err;
      }
    });
  }

  async getRepo(): Promise<Repo> {
    const { data } = await this.octokit.request('GET /repos/{owner}/{repo}', {
      owner: this.owner,
      repo: this.repo,
    });
    return {
      owner: data.owner.login,
      name: data.name,
      defaultBranch: data.default_branch,
      private: data.private,
      htmlUrl: data.html_url,
    };
  }

  async listIssues(opts: { state?: 'open' | 'closed' | 'all' } = {}): Promise<Issue[]> {
    const state = opts.state ?? 'open';
    const data = (await this.octokit.paginate('GET /repos/{owner}/{repo}/issues', {
      owner: this.owner,
      repo: this.repo,
      state,
      per_page: 100,
    })) as RawIssue[];
    return data.map(rawIssueToIssue);
  }

  async getIssue(number: number): Promise<Issue> {
    const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
      owner: this.owner,
      repo: this.repo,
      issue_number: number,
    });
    return rawIssueToIssue(data as RawIssue);
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    const { data } = await this.octokit.request('POST /repos/{owner}/{repo}/issues', {
      owner: this.owner,
      repo: this.repo,
      title: input.title,
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.labels !== undefined ? { labels: input.labels } : {}),
      ...(input.assignees !== undefined ? { assignees: input.assignees } : {}),
    });
    return rawIssueToIssue(data as RawIssue);
  }

  async updateIssue(number: number, patch: UpdateIssuePatch): Promise<Issue> {
    const { data } = await this.octokit.request(
      'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
      {
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.labels !== undefined ? { labels: patch.labels } : {}),
        ...(patch.assignees !== undefined ? { assignees: patch.assignees } : {}),
      },
    );
    return rawIssueToIssue(data as RawIssue);
  }

  async setLabels(number: number, labels: string[]): Promise<void> {
    await this.octokit.request('PUT /repos/{owner}/{repo}/issues/{issue_number}/labels', {
      owner: this.owner,
      repo: this.repo,
      issue_number: number,
      labels,
    });
  }

  async addComment(number: number, body: string): Promise<Comment> {
    const { data } = await this.octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
        body,
      },
    );
    return rawCommentToComment(data as RawComment);
  }

  async listComments(number: number): Promise<Comment[]> {
    const data = (await this.octokit.paginate(
      'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
        per_page: 100,
      },
    )) as RawComment[];
    return data.map(rawCommentToComment);
  }

  async ensureLabels(): Promise<void> {
    for (const label of ALL_KANBOTS_LABELS) {
      const exists = await this.labelExists(label.name);
      if (exists) continue;
      await this.octokit.request('POST /repos/{owner}/{repo}/labels', {
        owner: this.owner,
        repo: this.repo,
        name: label.name,
        color: label.color,
        ...(typeof label.description === 'string' ? { description: label.description } : {}),
      });
    }
  }

  private async labelExists(name: string): Promise<boolean> {
    try {
      await this.octokit.request('GET /repos/{owner}/{repo}/labels/{name}', {
        owner: this.owner,
        repo: this.repo,
        name,
      });
      return true;
    } catch (err) {
      if (isRequestError(err) && err.status === 404) return false;
      throw err;
    }
  }

  async findOpenPullForBranch(branch: string): Promise<PullRequest | null> {
    // GitHub's `head` filter requires the `owner:branch` form to scope
    // to a specific repo's branch (PRs from forks include a different
    // owner). Listing in `all` state means a recently-merged PR still
    // surfaces — useful for the issue thread, which keeps showing the
    // PR review section after merge.
    const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner: this.owner,
      repo: this.repo,
      head: `${this.owner}:${branch}`,
      state: 'all',
      per_page: 1,
      sort: 'created',
      direction: 'desc',
    });
    const list = data as RawPullRequest[];
    if (list.length === 0) return null;
    return rawPullToPullRequest(list[0]!);
  }

  async listPullReviewComments(
    pullNumber: number,
  ): Promise<PullRequestReviewComment[]> {
    const data = (await this.octokit.paginate(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
      {
        owner: this.owner,
        repo: this.repo,
        pull_number: pullNumber,
        per_page: 100,
      },
    )) as RawPullRequestReviewComment[];
    return data.map(rawReviewCommentToReviewComment);
  }

  async openDraftPR(input: OpenPRInput): Promise<PullRequest> {
    const issueRef = input.issueNumber ? `Closes #${input.issueNumber}\n\n` : '';
    const body = `${issueRef}${input.body ?? ''}`.trim();
    const { data } = await this.octokit.request('POST /repos/{owner}/{repo}/pulls', {
      owner: this.owner,
      repo: this.repo,
      title: input.title,
      body,
      head: input.head,
      base: input.base ?? 'main',
      draft: input.draft ?? true,
    });
    return rawPullToPullRequest(data as RawPullRequest);
  }
}

function isRequestError(err: unknown): err is RequestError {
  if (err instanceof RequestError) return true;
  return err instanceof Error && typeof (err as { status?: unknown }).status === 'number';
}
