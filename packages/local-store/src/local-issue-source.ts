import type {
  Comment,
  CreateIssueInput,
  Issue,
  IssueRef,
  IssueSource,
  UpdateIssuePatch,
} from '@kanbots/core';
import { LocalIssueNotFoundError, type LocalIssuesRepo } from './repos/local-issues.js';

export interface LocalIssueSourceOptions {
  repo: LocalIssuesRepo;
  authorLogin: string;
  folderId?: string;
}

export class LocalIssueSource implements IssueSource {
  private readonly repo: LocalIssuesRepo;
  readonly authorLogin: string;
  private readonly folderId: string | undefined;

  constructor(opts: LocalIssueSourceOptions) {
    this.repo = opts.repo;
    this.authorLogin = opts.authorLogin;
    this.folderId = opts.folderId;
  }

  async listIssues(
    opts: { state?: 'open' | 'closed' | 'all'; folderId?: string } = {},
  ): Promise<Issue[]> {
    return this.repo.list(opts);
  }

  async getIssue(number: IssueRef): Promise<Issue> {
    const issue = this.repo.findByNumber(number);
    if (!issue) throw new LocalIssueNotFoundError(number);
    return issue;
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    return this.repo.create({
      title: input.title,
      ...(input.number !== undefined ? { number: input.number } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.labels !== undefined ? { labels: input.labels } : {}),
      ...(input.assignees !== undefined ? { assignees: input.assignees } : {}),
      authorLogin: this.authorLogin,
      ...(this.folderId !== undefined ? { folderId: this.folderId } : {}),
    });
  }

  async updateIssue(number: IssueRef, patch: UpdateIssuePatch): Promise<Issue> {
    return this.repo.update(number, patch);
  }

  async listComments(number: IssueRef): Promise<Comment[]> {
    return this.repo.listComments(number);
  }

  async addComment(number: IssueRef, body: string): Promise<Comment> {
    return this.repo.addComment({
      issueNumber: number,
      body,
      authorLogin: this.authorLogin,
    });
  }
}
