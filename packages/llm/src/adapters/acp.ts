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
 * ACP (Agent Client Protocol) meta-provider.
 *
 * ACP is the JSON-RPC 2.0 contract Zed defined for agents — several CLIs
 * speak it natively (Gemini's `--experimental-acp`, Copilot's `--acp`,
 * Qwen's `--acp`, ...). Rather than duplicating the parser across each
 * agent, kanbots exposes `acp` as a meta-provider: pick it as the
 * provider for a run and the dispatcher invokes whichever ACP-capable
 * binary the user has configured (default: `gemini --experimental-acp`,
 * overridable via the workspace `acp_command` setting / the
 * `KANBOTS_ACP_COMMAND` env var).
 *
 * Auth: ACP delegates to whichever agent is actually spawned. The app
 * does not store or inject ACP credentials.
 */
export const acpAdapter: ProviderAdapter = {
  id: 'acp',
  capabilities: {
    streaming: true,
    toolUse: true,
    parallelToolCalls: true,
    imageInput: false,
    resumeBySessionId: false,
    agentRuns: true,
  },

  async validate(_creds: ProviderCredentials): Promise<ValidateResult> {
    return { ok: true };
  },

  async chat(_req: ChatRequest, _creds: ProviderCredentials): Promise<ChatResponse> {
    throw new Error(
      'acp adapter does not support one-shot chat. Use `startAgentRun` for interactive runs.',
    );
  },

  startAgentRun(opts: StartAgentRunOptions, _creds: ProviderCredentials): AgentRunHandle {
    return defaultStartAgentRun({ ...opts, provider: 'acp' });
  },
};
