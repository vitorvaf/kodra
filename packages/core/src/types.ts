export type IssueState = 'open' | 'closed';

export interface User {
  login: string;
  avatarUrl: string | null;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: IssueState;
  labels: string[];
  assignees: string[];
  user: User;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  htmlUrl: string;
  isPullRequest: boolean;
}

export interface Comment {
  id: number;
  body: string;
  user: User;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface Label {
  name: string;
  color: string;
  description: string | null;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: IssueState;
  draft: boolean;
  htmlUrl: string;
  head: string;
  base: string;
}

/**
 * An inline "review comment" on a PR — i.e. one attached to a specific
 * file path and line in the diff. Distinct from the conversation-level
 * comments on the PR, which are plain `Comment`s and reachable via the
 * same issue-comments endpoint.
 */
export interface PullRequestReviewComment {
  id: number;
  body: string;
  user: User;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  /** File the comment hit. Always present for review comments. */
  path: string;
  /** Line number the comment hit on. GitHub returns `line` for the new
   *  side and `original_line` for the old side; we surface whichever is
   *  non-null. May be null for outdated comments whose diff position no
   *  longer maps to a concrete line. */
  line: number | null;
  /** `RIGHT` = new side, `LEFT` = old side. Mirrors GitHub's wire shape. */
  side: 'LEFT' | 'RIGHT' | null;
}

export interface Repo {
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
}

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface UpdateIssuePatch {
  title?: string;
  body?: string;
  state?: IssueState;
  labels?: string[];
  assignees?: string[];
}

export interface OpenPRInput {
  title: string;
  body?: string;
  head: string;
  base?: string;
  draft?: boolean;
  issueNumber?: number;
}
