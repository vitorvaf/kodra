import type { Comment, Issue } from '@kanbots/core';

export function issueFixture(number: number, title: string, overrides: Partial<Issue> = {}): Issue {
  return {
    number,
    title,
    body: '',
    state: 'open',
    labels: [],
    assignees: [],
    user: { login: 'tester', avatarUrl: null },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    closedAt: null,
    htmlUrl: `https://github.com/octo/hello/issues/${number}`,
    isPullRequest: false,
    ...overrides,
  };
}

export function commentFixture(
  id: number,
  body: string,
  overrides: Partial<Comment> = {},
): Comment {
  return {
    id,
    body,
    user: { login: 'tester', avatarUrl: null },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    htmlUrl: `https://github.com/octo/hello/issues/1#issuecomment-${id}`,
    ...overrides,
  };
}
