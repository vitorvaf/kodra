import type {
  Comment,
  CreateIssueInput,
  Issue,
  IssueSource,
  UpdateIssuePatch,
} from '@kanbots/core';
import { LocalIssueNotFoundError, type LocalIssuesRepo } from './repos/local-issues.js';

export interface LocalIssueSourceOptions {
  repo: LocalIssuesRepo;
  authorLogin: string;
}

export class LocalIssueSource implements IssueSource {
  private readonly repo: LocalIssuesRepo;
  readonly authorLogin: string;

  constructor(opts: LocalIssueSourceOptions) {
    this.repo = opts.repo;
    this.authorLogin = opts.authorLogin;
  }

  async listIssues(opts: { state?: 'open' | 'closed' | 'all' } = {}): Promise<Issue[]> {
    return this.repo.list(opts);
  }

  async getIssue(number: number): Promise<Issue> {
    const issue = this.repo.findByNumber(number);
    if (!issue) throw new LocalIssueNotFoundError(number);
    return issue;
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    return this.repo.create({
      title: input.title,
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.labels !== undefined ? { labels: input.labels } : {}),
      ...(input.assignees !== undefined ? { assignees: input.assignees } : {}),
      authorLogin: this.authorLogin,
    });
  }

  async updateIssue(number: number, patch: UpdateIssuePatch): Promise<Issue> {
    return this.repo.update(number, patch);
  }

  async listComments(number: number): Promise<Comment[]> {
    return this.repo.listComments(number);
  }

  async addComment(number: number, body: string): Promise<Comment> {
    return this.repo.addComment({
      issueNumber: number,
      body,
      authorLogin: this.authorLogin,
    });
  }
}
