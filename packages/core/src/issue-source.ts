import type {
  Comment,
  CreateIssueInput,
  Issue,
  OpenPRInput,
  PullRequest,
  PullRequestReviewComment,
  UpdateIssuePatch,
} from './types.js';

/**
 * The contract every issue backend implements.
 *
 * Two implementations exist (or will exist):
 *   - GitHubIssueSource — issues live on github.com (current default)
 *   - LocalIssueSource — issues live in the workspace's SQLite, no remote
 */
export interface IssueSource {
  listIssues(opts?: { state?: 'open' | 'closed' | 'all' }): Promise<Issue[]>;
  getIssue(number: number): Promise<Issue>;
  createIssue(input: CreateIssueInput): Promise<Issue>;
  updateIssue(number: number, patch: UpdateIssuePatch): Promise<Issue>;
  listComments(number: number): Promise<Comment[]>;
  addComment(number: number, body: string): Promise<Comment>;
  // Optional — only github-backed sources can open PRs.
  openDraftPR?(input: OpenPRInput): Promise<PullRequest>;
  /**
   * Find an open PR by branch (`head` ref). Used to resolve "the PR for
   * this issue" via the issue's most recent agent run branch. Optional
   * because local-only sources have no notion of PRs.
   */
  findOpenPullForBranch?(branch: string): Promise<PullRequest | null>;
  /**
   * List inline review comments on a PR. These are the file/line-anchored
   * comments shown alongside the diff on github.com; they are distinct
   * from the PR's conversation-tab comments (which go through the
   * regular `listComments` issue endpoint because PRs are issues).
   */
  listPullReviewComments?(pullNumber: number): Promise<PullRequestReviewComment[]>;
}
