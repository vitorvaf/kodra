export const PACKAGE_NAME = '@kanbots/core';

export { GitHubClient, type GitHubClientOptions } from './github-client.js';
export {
  SentryClient,
  SentryAuthError,
  SentryRequestError,
  type SentryClientOptions,
  type ListIssuesOptions as SentryListIssuesOptions,
} from './sentry-client.js';
export type {
  SentryBreadcrumb,
  SentryEventDetail,
  SentryExceptionValue,
  SentryIssueDetail,
  SentryIssueSummary,
  SentryListResult,
  SentryStackFrame,
} from './sentry-types.js';
export { resolveGitHubToken, TOKEN_FILE_PATH, type AuthDeps } from './auth.js';
export type { IssueSource } from './issue-source.js';
export { GitHubRequestError, KanbotsAuthError, KanbotsError } from './errors.js';
export {
  AGENT_LABELS,
  AGENT_PREFIX,
  ALL_KANBOTS_LABELS,
  STATUS_LABELS,
  STATUS_PREFIX,
  agentFromLabels,
  statusFromLabels,
  withAgentLabel,
  withStatusLabel,
  type AgentKey,
  type StatusKey,
} from './labels.js';
export type { CacheEntry, ETagCache, SetCacheInput } from './etag-cache.js';
export type {
  Comment,
  CreateIssueInput,
  Issue,
  IssueState,
  Label,
  OpenPRInput,
  PullRequest,
  PullRequestReviewComment,
  Repo,
  UpdateIssuePatch,
  User,
} from './types.js';
