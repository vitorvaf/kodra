import { describe, expect, it } from 'vitest';
import {
  MEMORY_DEFAULTS,
  projectIdFromPath,
  resolveMemoryConfig,
} from '../../src/memory/config.js';

describe('resolveMemoryConfig', () => {
  it('is disabled with defaults when nothing is configured', () => {
    const cfg = resolveMemoryConfig({ env: {} });
    expect(cfg.enabled).toBe(false);
    expect(cfg.url).toBe(MEMORY_DEFAULTS.url);
    expect(cfg.secret).toBeNull();
    expect(cfg.teamId).toBeNull();
    expect(cfg.userId).toBeNull();
    expect(cfg.agentId).toBeNull();
    expect(cfg.mode).toBe('private');
    expect(cfg.timeoutMs).toBe(MEMORY_DEFAULTS.timeoutMs);
    expect(cfg.maxContextItems).toBe(MEMORY_DEFAULTS.maxContextItems);
    expect(cfg.maxContextChars).toBe(MEMORY_DEFAULTS.maxContextChars);
  });

  it('reads identity and limits from AGENTMEMORY_* variables', () => {
    const cfg = resolveMemoryConfig({
      env: {
        AGENTMEMORY_ENABLED: 'true',
        AGENTMEMORY_URL: 'http://memory.local:3111/',
        AGENTMEMORY_SECRET: ' s3cret ',
        AGENTMEMORY_PROJECT: 'payments',
        AGENTMEMORY_TEAM_ID: 'platform',
        AGENTMEMORY_USER_ID: 'cecon',
        AGENTMEMORY_AGENT_ID: 'opencode',
        AGENTMEMORY_MODE: 'shared',
        AGENTMEMORY_TIMEOUT_MS: '500',
        AGENTMEMORY_MAX_CONTEXT_ITEMS: '3',
        AGENTMEMORY_MAX_CONTEXT_CHARS: '1000',
      },
    });
    expect(cfg).toMatchObject({
      enabled: true,
      url: 'http://memory.local:3111',
      secret: 's3cret',
      project: 'payments',
      teamId: 'platform',
      userId: 'cecon',
      agentId: 'opencode',
      mode: 'shared',
      timeoutMs: 500,
      maxContextItems: 3,
      maxContextChars: 1000,
    });
  });

  it('lets env override the workspace config and falls back to it otherwise', () => {
    const workspace = {
      enabled: true,
      provider: 'agentmemory' as const,
      url: 'http://ws:3111',
      secret: 'ws-secret',
      scope: 'team' as const,
      teamId: 'ws-team',
    };
    const fromWorkspace = resolveMemoryConfig({ env: {}, workspace });
    expect(fromWorkspace).toMatchObject({
      enabled: true,
      url: 'http://ws:3111',
      secret: 'ws-secret',
      teamId: 'ws-team',
    });

    const overridden = resolveMemoryConfig({
      env: { AGENTMEMORY_ENABLED: 'false', AGENTMEMORY_URL: 'http://env:3111' },
      workspace,
    });
    expect(overridden.enabled).toBe(false);
    expect(overridden.url).toBe('http://env:3111');
    expect(overridden.secret).toBe('ws-secret');
  });

  it('ignores blank secrets and clamps out-of-range numbers', () => {
    const cfg = resolveMemoryConfig({
      env: {
        AGENTMEMORY_SECRET: '   ',
        AGENTMEMORY_TIMEOUT_MS: '5',
        AGENTMEMORY_MAX_CONTEXT_ITEMS: '9999',
        AGENTMEMORY_MODE: 'bogus',
      },
    });
    expect(cfg.secret).toBeNull();
    expect(cfg.timeoutMs).toBe(100);
    expect(cfg.maxContextItems).toBe(100);
    expect(cfg.mode).toBe('private');
  });

  it('accepts the usual boolean spellings', () => {
    for (const v of ['1', 'yes', 'on', 'TRUE']) {
      expect(resolveMemoryConfig({ env: { AGENTMEMORY_ENABLED: v } }).enabled).toBe(true);
    }
    for (const v of ['0', 'no', 'off', 'False', 'maybe']) {
      expect(resolveMemoryConfig({ env: { AGENTMEMORY_ENABLED: v } }).enabled).toBe(false);
    }
  });
});

describe('projectIdFromPath', () => {
  it('uses the last path segment as a slug, never the full path', () => {
    expect(projectIdFromPath('D:\\projetos\\Kodra App')).toBe('kodra-app');
    expect(projectIdFromPath('/home/dev/payment_hub/')).toBe('payment_hub');
    expect(projectIdFromPath('')).toBe('project');
  });
});
