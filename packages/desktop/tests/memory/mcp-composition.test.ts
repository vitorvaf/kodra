import { describe, expect, it } from 'vitest';
import type { MemoryConfig } from '@kanbots/local-store';
import {
  agentMemoryMcpEntry,
  withAgentMemory,
  type McpServerEntry,
} from '../../src/memory/mcp-composition.js';

const base: McpServerEntry = {
  command: 'node',
  args: ['server.js'],
  env: { KANBOTS: '1' },
};

const memory = (overrides: Partial<MemoryConfig> = {}): MemoryConfig => ({
  enabled: true,
  provider: 'agentmemory',
  url: 'http://localhost:3111',
  secret: null,
  scope: 'shared',
  teamId: null,
  ...overrides,
});

describe('agentmemory MCP composition', () => {
  it('returns null when memory is undefined or disabled', () => {
    expect(agentMemoryMcpEntry(undefined)).toBeNull();
    expect(agentMemoryMcpEntry(memory({ enabled: false }))).toBeNull();
    expect(withAgentMemory({ kanbots: base }, undefined)).toEqual({ kanbots: base });
    expect(withAgentMemory({ kanbots: base }, memory({ enabled: false }))).toEqual({
      kanbots: base,
    });
  });

  it('creates the MCP entry with the URL and optional secret', () => {
    expect(agentMemoryMcpEntry(memory())).toEqual({
      command: 'npx',
      args: ['-y', '@agentmemory/mcp'],
      env: { AGENTMEMORY_URL: 'http://localhost:3111' },
    });
    expect(agentMemoryMcpEntry(memory({ secret: 'secret' }))).toEqual({
      command: 'npx',
      args: ['-y', '@agentmemory/mcp'],
      env: {
        AGENTMEMORY_URL: 'http://localhost:3111',
        AGENTMEMORY_SECRET: 'secret',
      },
    });
  });

  it('merges agentmemory alongside the kanbots server', () => {
    expect(withAgentMemory({ kanbots: base }, memory())).toEqual({
      kanbots: base,
      agentmemory: agentMemoryMcpEntry(memory()),
    });
  });
});
