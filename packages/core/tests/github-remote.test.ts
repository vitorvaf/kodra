import { describe, expect, it } from 'vitest';
import { parseGitHubRemoteUrl } from '../src/github-remote.js';

describe('parseGitHubRemoteUrl', () => {
  it.each([
    ['git@github.com:octo/hello.git', { owner: 'octo', repo: 'hello' }],
    ['ssh://git@github.com/octo/hello.git', { owner: 'octo', repo: 'hello' }],
    ['https://user@github.com/octo/hello', { owner: 'octo', repo: 'hello' }],
    ['https://github.com/octo/hello.git', { owner: 'octo', repo: 'hello' }],
    ['https://github.com/octo/hello/', { owner: 'octo', repo: 'hello' }],
  ])('parses %s', (url, expected) => {
    expect(parseGitHubRemoteUrl(url)).toEqual(expected);
  });

  it.each([
    'https://gitlab.com/octo/hello.git',
    'not a remote URL',
    'https://github.com/octo/.git',
    'HTTPS://github.com/octo/hello',
  ])('returns null for %s', (url) => {
    expect(parseGitHubRemoteUrl(url)).toBeNull();
  });
});
