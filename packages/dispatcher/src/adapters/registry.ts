import { acpAdapter } from './acp.js';
import { ampCliAdapter } from './amp-cli.js';
import { agyCliAdapter } from './agy-cli.js';
import { ccrCliAdapter } from './ccr-cli.js';
import { claudeCodeAdapter } from './claude-code.js';
import { codexCliAdapter } from './codex-cli.js';
import { copilotCliAdapter } from './copilot-cli.js';
import { cursorCliAdapter } from './cursor-cli.js';
import { droidCliAdapter } from './droid-cli.js';
import { geminiCliAdapter } from './gemini-cli.js';
import { opencodeCliAdapter } from './opencode-cli.js';
import { qwenCliAdapter } from './qwen-cli.js';
import type { AgentCliAdapter } from './types.js';

export type AgentRunProvider =
  | 'claude-code'
  | 'codex-cli'
  | 'gemini-cli'
  | 'agy-cli'
  | 'amp-cli'
  | 'cursor-cli'
  | 'copilot-cli'
  | 'opencode-cli'
  | 'droid-cli'
  | 'ccr-cli'
  | 'qwen-cli'
  | 'acp';

/**
 * Single source of truth mapping provider ids to their CLI adapters.
 * Consumed by the agent-run worker (streaming runs) and by the composer's
 * generic suggester path (one-shot ideation runs), so both spawn every
 * provider exactly the same way.
 */
export const AGENT_CLI_ADAPTERS: Record<AgentRunProvider, AgentCliAdapter> = {
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
};
