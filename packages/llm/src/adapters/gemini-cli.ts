import {
  startAgentRun as defaultStartAgentRun,
  type AgentRunHandle,
  type StartAgentRunOptions,
} from '@kanbots/dispatcher';
import type {
  ChatRequest,
  ChatResponse,
  ProviderAdapter,
  ProviderCredentials,
  ValidateResult,
} from '../types.js';

/**
 * Google Gemini CLI adapter. Wraps the dispatcher's `startAgentRun`, which
 * routes to the gemini-cli adapter inside the dispatcher when `provider:
 * 'gemini-cli'` is set on the run options.
 *
 * Auth: gemini finds its own credentials. `gemini /login` writes
 * `~/.gemini/oauth_creds.json`; `GEMINI_API_KEY` in the environment is also
 * honored. The app does not store or inject gemini credentials.
 *
 * One-shot `chat()` is unsupported: gemini is interactive-only here.
 */
export const geminiCliAdapter: ProviderAdapter = {
  id: 'gemini-cli',
  capabilities: {
    streaming: true,
    toolUse: true,
    parallelToolCalls: false,
    imageInput: true,
    resumeBySessionId: false,
    agentRuns: true,
  },

  async validate(_creds: ProviderCredentials): Promise<ValidateResult> {
    // Keep validate cheap and sandbox-safe — we don't shell out to
    // `gemini --version` here. The dispatcher surfaces a meaningful error
    // at run time if the binary is missing on PATH.
    return { ok: true };
  },

  async chat(_req: ChatRequest, _creds: ProviderCredentials): Promise<ChatResponse> {
    throw new Error(
      'gemini-cli adapter does not support one-shot chat. Use `startAgentRun` for interactive runs.',
    );
  },

  startAgentRun(opts: StartAgentRunOptions, _creds: ProviderCredentials): AgentRunHandle {
    return defaultStartAgentRun({ ...opts, provider: 'gemini-cli' });
  },
};
