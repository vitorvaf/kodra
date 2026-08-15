import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWorkspaceConfig } from '../src/workspace.js';

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function readConfig(config: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'kanbots-workspace-test-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, '.kanbots'));
  writeFileSync(join(dir, '.kanbots', 'config.json'), JSON.stringify(config));
  return readWorkspaceConfig(dir);
}

const baseConfig = { mode: 'local', name: 'test', authorLogin: 'tester' };

describe('workspace memory and RTK config', () => {
  it('parses a full memory config and applies defaults', async () => {
    const config = await readConfig({
      ...baseConfig,
      memory: {
        enabled: true,
        provider: 'agentmemory',
        secret: 'test-secret',
        scope: 'team',
        teamId: 'team-a',
      },
    });

    expect(config?.memory).toEqual({
      enabled: true,
      provider: 'agentmemory',
      url: 'http://localhost:3111',
      secret: 'test-secret',
      scope: 'team',
      teamId: 'team-a',
    });
  });

  it('honors an explicitly disabled memory config', async () => {
    const config = await readConfig({ ...baseConfig, memory: { enabled: false } });

    expect(config?.memory).toEqual({
      enabled: false,
      provider: 'agentmemory',
      url: 'http://localhost:3111',
      secret: null,
      scope: 'shared',
      teamId: null,
    });
  });

  it('warns and falls back to shared for an invalid scope', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = await readConfig({
      ...baseConfig,
      memory: { enabled: true, scope: 'workspace' },
    });

    expect(config?.memory?.scope).toBe('shared');
    expect(warn).toHaveBeenCalled();
  });

  it('warns and falls back to shared when team scope has no teamId', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = await readConfig({
      ...baseConfig,
      memory: { enabled: true, scope: 'team' },
    });

    expect(config?.memory?.scope).toBe('shared');
    expect(config?.memory?.teamId).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('does not create a disabled memory config when memory is absent', async () => {
    const config = await readConfig(baseConfig);

    expect(config?.memory).toBeUndefined();
  });

  it('parses rtk assumeInstalled', async () => {
    const config = await readConfig({ ...baseConfig, rtk: { assumeInstalled: true } });

    expect(config?.rtk).toEqual({ assumeInstalled: true });
  });

  it('warns and drops unknown keys without crashing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = await readConfig({
      ...baseConfig,
      memory: { enabled: true, extra: 'drop-me' },
      rtk: { assumeInstalled: true, extra: 'drop-me' },
    });

    expect(config?.memory).not.toHaveProperty('extra');
    expect(config?.rtk).not.toHaveProperty('extra');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('returns null for a malformed workspace shape instead of crashing', async () => {
    await expect(readConfig({ mode: 'local', name: 'missing-author' })).resolves.toBeNull();
  });
});
