export const PACKAGE_NAME = '@kanbots/llm';

export {
  MODELS,
  findModel,
  modelsForProvider,
  recommendedModel,
} from './catalogue.js';

export { acpAdapter } from './adapters/acp.js';
export { ampCliAdapter } from './adapters/amp-cli.js';
export { ccrCliAdapter } from './adapters/ccr-cli.js';
export { claudeCodeAdapter } from './adapters/claude-code.js';
export { codexCliAdapter } from './adapters/codex-cli.js';
export { copilotCliAdapter } from './adapters/copilot-cli.js';
export { cursorCliAdapter } from './adapters/cursor-cli.js';
export { droidCliAdapter } from './adapters/droid-cli.js';
export { geminiCliAdapter } from './adapters/gemini-cli.js';
export { opencodeCliAdapter } from './adapters/opencode-cli.js';
export { qwenCliAdapter } from './adapters/qwen-cli.js';

export { chat, getAdapter, listAdapters, validateProvider } from './manager.js';

export { discoverSlashCommands } from './slashCommands.js';

export type {
  AgentRunHandle,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ModelEntry,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderCredentials,
  ProviderId,
  StartAgentRunOptions,
  StreamEvent,
  ValidateResult,
} from './types.js';

export type {
  AgentKey,
  SlashCommand,
  SlashCommandSource,
} from './slashCommands.js';
