import { describe, expect, it } from 'vitest';
import type { AgentRunProvider } from '@kanbots/dispatcher';
import {
  PROVIDER_FALLBACK_ORDER,
  resolveProviderWithCreds,
} from '../../src/handlers/provider-credentials.js';

describe('resolveProviderWithCreds', () => {
  it('honours an explicit provider verbatim, even when it has no credentials', () => {
    const hasCreds = (id: AgentRunProvider) => id === 'opencode-cli';
    expect(resolveProviderWithCreds('claude-code', undefined, hasCreds)).toBe('claude-code');
  });

  it('uses the default provider when it has credentials', () => {
    const hasCreds = (id: AgentRunProvider) => id === 'claude-code';
    expect(resolveProviderWithCreds(undefined, 'claude-code', hasCreds)).toBe('claude-code');
  });

  it('skips a default without credentials and falls back to the first credentialed provider', () => {
    // The regression: user removed Claude Code credentials, so a picker-less
    // dispatch must not funnel into claude-code — it should land on opencode.
    const hasCreds = (id: AgentRunProvider) => id === 'opencode-cli';
    expect(resolveProviderWithCreds(undefined, 'claude-code', hasCreds)).toBe('opencode-cli');
  });

  it('respects PROVIDER_FALLBACK_ORDER when multiple providers are configured', () => {
    const hasCreds = (id: AgentRunProvider) => id === 'codex-cli' || id === 'opencode-cli';
    // opencode-cli is listed before codex-cli in the fallback order.
    expect(resolveProviderWithCreds(undefined, undefined, hasCreds)).toBe('opencode-cli');
  });

  it('falls through a bogus default to the first credentialed provider', () => {
    const hasCreds = (id: AgentRunProvider) => id === 'codex-cli';
    expect(
      resolveProviderWithCreds(undefined, 'not-a-real-provider' as AgentRunProvider, hasCreds),
    ).toBe('codex-cli');
  });

  it('returns claude-code as the safety net when nothing has credentials', () => {
    expect(resolveProviderWithCreds(undefined, undefined, () => false)).toBe('claude-code');
  });

  it('claude-code is the first entry of the fallback order', () => {
    expect(PROVIDER_FALLBACK_ORDER[0]).toBe('claude-code');
  });
});
