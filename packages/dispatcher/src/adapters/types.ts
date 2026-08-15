import type { StreamEvent } from '../stream-parser.js';

export interface BuildArgsInput {
  resumeFromSessionId?: string;
  allowedTools?: string;
  appendSystemPrompt?: string;
  model?: string;
  extraArgs?: readonly string[];
}

export type PromptDelivery = 'stdin' | 'argv';

export interface ComposePromptInput {
  systemPrompt?: string;
  prompt: string;
}

export interface AgentCliAdapter {
  command: string;
  promptDelivery: PromptDelivery;
  /**
   * How this CLI accepts MCP server configuration at spawn time, from kanbots's perspective (transient, workspace-scoped wiring — NOT user-global config).
   * - 'file'       → accepts `--mcp-config <path>` pointing at a JSON file
   * - 'flags'      → accepts per-server flags (e.g. codex `-c mcp_servers.<n>.*`)
   * - 'config-dir' → reads a config dir kanbots could populate (reserved; unused today)
   * - 'none'       → not wireable at spawn time; callers fall back to prompt injection
   * Omit when unknown; callers treat omitted the same as 'none'.
   */
  mcpSupport?: 'file' | 'flags' | 'config-dir' | 'none';
  buildArgs(opts: BuildArgsInput): string[];
  parseLine(line: string): StreamEvent[];
  detectRateLimit?(stderrChunk: string): Extract<StreamEvent, { kind: 'rate_limit' }> | null;
  /**
   * Compose the final prompt string sent to the CLI. The worker calls this
   * (when the adapter implements it) and either pipes the result into stdin
   * or appends it to argv depending on `promptDelivery`. Adapters that have
   * a native flag for the system prompt (e.g. claude's `--append-system-prompt`)
   * leave this unset and ignore `systemPrompt` here. Adapters without one
   * (e.g. codex) prepend it with their preferred delimiter.
   */
  composePrompt?(input: ComposePromptInput): string;
}
