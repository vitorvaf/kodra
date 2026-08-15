import { describe, expect, it } from 'vitest';
import { acpAdapter } from '../src/adapters/acp.js';
import { ampCliAdapter } from '../src/adapters/amp-cli.js';
import { agyCliAdapter } from '../src/adapters/agy-cli.js';
import { ccrCliAdapter } from '../src/adapters/ccr-cli.js';
import { claudeCodeAdapter } from '../src/adapters/claude-code.js';
import { codexCliAdapter } from '../src/adapters/codex-cli.js';
import { copilotCliAdapter } from '../src/adapters/copilot-cli.js';
import { cursorCliAdapter } from '../src/adapters/cursor-cli.js';
import { droidCliAdapter } from '../src/adapters/droid-cli.js';
import { geminiCliAdapter } from '../src/adapters/gemini-cli.js';
import { opencodeCliAdapter } from '../src/adapters/opencode-cli.js';
import { qwenCliAdapter } from '../src/adapters/qwen-cli.js';
import { getAdapterMcpSupport } from '../src/worker.js';

const adapters = {
  'claude-code': claudeCodeAdapter,
  'codex-cli': codexCliAdapter,
  'gemini-cli': geminiCliAdapter,
  'agy-cli': agyCliAdapter,
  'amp-cli': ampCliAdapter,
  'cursor-cli': cursorCliAdapter,
  'copilot-cli': copilotCliAdapter,
  'opencode-cli': opencodeCliAdapter,
  'droid-cli': droidCliAdapter,
  'ccr-cli': ccrCliAdapter,
  'qwen-cli': qwenCliAdapter,
  acp: acpAdapter,
} as const;

describe('adapter MCP support', () => {
  it('declares the spawn-time MCP support for Claude Code and Codex', () => {
    expect(adapters['claude-code'].mcpSupport).toBe('file');
    expect(adapters['codex-cli'].mcpSupport).toBe('flags');
  });

  it('declares MCP support for every registered adapter', () => {
    for (const adapter of Object.values(adapters)) {
      expect(adapter.mcpSupport).toBeDefined();
    }
  });

  describe('getAdapterMcpSupport', () => {
    it('maps the wireable providers to their spawn-time mechanism', () => {
      expect(getAdapterMcpSupport('claude-code')).toBe('file');
      expect(getAdapterMcpSupport('codex-cli')).toBe('flags');
    });

    it('returns none for providers that reject spawn-time MCP flags', () => {
      // These CLIs have no `--mcp-config` equivalent; passing it crashes the
      // run with an unknown-flag error before it starts.
      expect(getAdapterMcpSupport('opencode-cli')).toBe('none');
      expect(getAdapterMcpSupport('gemini-cli')).toBe('none');
      expect(getAdapterMcpSupport('agy-cli')).toBe('config-dir');
      expect(getAdapterMcpSupport('amp-cli')).toBe('none');
      expect(getAdapterMcpSupport('copilot-cli')).toBe('none');
      expect(getAdapterMcpSupport('cursor-cli')).toBe('none');
      expect(getAdapterMcpSupport('droid-cli')).toBe('none');
      expect(getAdapterMcpSupport('ccr-cli')).toBe('none');
      expect(getAdapterMcpSupport('qwen-cli')).toBe('none');
      expect(getAdapterMcpSupport('acp')).toBe('none');
    });

    it('agrees with every adapter declaration', () => {
      for (const [name, adapter] of Object.entries(adapters)) {
        expect(getAdapterMcpSupport(name as keyof typeof adapters)).toBe(adapter.mcpSupport);
      }
    });
  });
});
