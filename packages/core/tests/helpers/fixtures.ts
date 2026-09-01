export function issueFixture(
  number: number,
  title: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    number,
    title,
    body: '',
    state: 'open',
    labels: [],
    assignees: [],
    user: { login: 'tester', avatar_url: 'https://avatars/tester' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    closed_at: null,
    html_url: `https://github.com/octo/hello/issues/${number}`,
    ...extra,
  };
}

export function commentFixture(id: number, body: string): Record<string, unknown> {
  return {
    id,
    body,
    user: { login: 'tester', avatar_url: 'https://avatars/tester' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    html_url: `https://github.com/octo/hello/issues/1#issuecomment-${id}`,
  };
}

export function labelFixture(name: string, color = 'fbca04'): Record<string, unknown> {
  return { id: name.length, name, color, description: null };
}

export function pullFixture(number: number, title: string): Record<string, unknown> {
  return {
    number,
    title,
    body: '',
    state: 'open',
    draft: true,
    html_url: `https://github.com/octo/hello/pull/${number}`,
    head: { ref: `agent/issue-${number}` },
    base: { ref: 'main' },
  };
}
