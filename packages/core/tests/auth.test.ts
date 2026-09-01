import { describe, expect, it } from 'vitest';
import { resolveGitHubToken } from '../src/auth.js';
import { KanbotsAuthError } from '../src/errors.js';

describe('resolveGitHubToken', () => {
  it('uses gh CLI first', async () => {
    const token = await resolveGitHubToken({
      runGhCli: async () => 'gh-token',
      readEnv: () => 'env-token',
      readTokenFile: async () => 'file-token',
    });
    expect(token).toBe('gh-token');
  });

  it('falls back to env when gh fails', async () => {
    const token = await resolveGitHubToken({
      runGhCli: async () => null,
      readEnv: () => 'env-token',
      readTokenFile: async () => 'file-token',
    });
    expect(token).toBe('env-token');
  });

  it('falls back to file when gh and env fail', async () => {
    const token = await resolveGitHubToken({
      runGhCli: async () => null,
      readEnv: () => undefined,
      readTokenFile: async () => 'file-token',
    });
    expect(token).toBe('file-token');
  });

  it('throws KanbotsAuthError when nothing works', async () => {
    await expect(
      resolveGitHubToken({
        runGhCli: async () => null,
        readEnv: () => undefined,
        readTokenFile: async () => null,
      }),
    ).rejects.toThrow(KanbotsAuthError);
  });

  it('treats empty strings as missing', async () => {
    const token = await resolveGitHubToken({
      runGhCli: async () => '',
      readEnv: () => '   ',
      readTokenFile: async () => 'file-token',
    });
    expect(token).toBe('file-token');
  });

  it('error message lists all options', async () => {
    try {
      await resolveGitHubToken({
        runGhCli: async () => null,
        readEnv: () => undefined,
        readTokenFile: async () => null,
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KanbotsAuthError);
      const msg = (err as Error).message;
      expect(msg).toContain('gh auth login');
      expect(msg).toContain('GITHUB_TOKEN');
      expect(msg).toContain('~/.kanbots/token');
    }
  });
});
