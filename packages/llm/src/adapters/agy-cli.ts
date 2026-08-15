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

/** Google Antigravity CLI adapter. Authentication is managed by `agy`. */
export const agyCliAdapter: ProviderAdapter = {
  id: 'agy-cli',
  capabilities: {
    streaming: true,
    toolUse: true,
    parallelToolCalls: false,
    imageInput: true,
    resumeBySessionId: true,
    agentRuns: true,
  },

  async validate(_creds: ProviderCredentials): Promise<ValidateResult> {
    return { ok: true };
  },

  async chat(_req: ChatRequest, _creds: ProviderCredentials): Promise<ChatResponse> {
    throw new Error(
      'agy-cli adapter does not support one-shot chat. Use `startAgentRun` for interactive runs.',
    );
  },

  startAgentRun(opts: StartAgentRunOptions, _creds: ProviderCredentials): AgentRunHandle {
    return defaultStartAgentRun({ ...opts, provider: 'agy-cli' });
  },
};
