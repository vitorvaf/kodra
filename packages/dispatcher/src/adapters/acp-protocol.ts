import {
  detectRateLimit as detectRateLimitFromText,
  type StreamEvent,
} from '../stream-parser.js';

/**
 * Agent Client Protocol (ACP) wire-shape parser.
 *
 * ACP is the JSON-RPC 2.0 contract Zed defined for agents. ACP-capable
 * agents (Cursor, Copilot, Gemini's `--experimental-acp`, Qwen's `--acp`,
 * ...) emit JSON-RPC notifications/responses over stdio. The lines we
 * care about are:
 *
 *   1. The agent's response to `prompt` — carries the final result.
 *   2. `session/update` notifications — emit AgentMessageChunk,
 *      AgentThoughtChunk, ToolCall, ToolCallUpdate, Plan blocks.
 *
 * This module is intentionally a pure stateless line parser so it can
 * be reused by both the generic ACP transport adapter and per-agent
 * adapters whose CLI just happens to speak ACP on stdout (Copilot is
 * the canonical example).
 *
 * NOTE: the parser is *receiver-only* — the JSON-RPC handshake (sending
 * `initialize`, `session/new`, `session/prompt`) lives in the generic
 * `acp.ts` adapter which talks JSON-RPC outbound. The per-CLI adapters
 * that route through here pipe their own prompt over stdin and rely on
 * the CLI to drive the handshake. That keeps this module dependency-free.
 */

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

interface ContentBlockText {
  type: 'text';
  text?: string;
}

interface ContentBlockImage {
  type: 'image';
  data?: string;
  mime_type?: string;
}

type ContentBlock = ContentBlockText | ContentBlockImage | { type: string };

interface AgentMessageChunkUpdate {
  type: 'agent_message_chunk';
  content?: ContentBlock | ContentBlock[];
}

interface AgentThoughtChunkUpdate {
  type: 'agent_thought_chunk';
  content?: ContentBlock | ContentBlock[];
}

interface ToolCallUpdate {
  type: 'tool_call';
  tool_call_id?: string;
  title?: string;
  kind?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  content?: unknown;
  raw_input?: unknown;
  raw_output?: unknown;
}

interface ToolCallUpdateUpdate {
  type: 'tool_call_update';
  tool_call_id?: string;
  fields?: {
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
    content?: unknown;
    raw_output?: unknown;
  };
}

type SessionUpdate =
  | AgentMessageChunkUpdate
  | AgentThoughtChunkUpdate
  | ToolCallUpdate
  | ToolCallUpdateUpdate
  | { type: string };

interface SessionUpdateParams {
  session_id?: string;
  update?: SessionUpdate;
}

interface PromptResponse {
  stop_reason?: string;
  // ACP's prompt response is intentionally lean — terminal classification
  // is derived from `stop_reason`. Token usage is reported elsewhere (a
  // future spec revision is expected to add it to the response).
}

function contentText(content: ContentBlock | ContentBlock[] | undefined): string {
  if (!content) return '';
  const blocks = Array.isArray(content) ? content : [content];
  let out = '';
  for (const b of blocks) {
    if (b && typeof b === 'object' && (b as ContentBlockText).type === 'text') {
      const t = (b as ContentBlockText).text;
      if (typeof t === 'string') out += t;
    }
  }
  return out;
}

/**
 * Parse one stdout line as an ACP JSON-RPC message and translate it to
 * kanbots' normalized StreamEvent list. Non-JSON, ping/pong, and
 * unknown methods are dropped silently to match the gemini adapter's
 * defensive parsing posture.
 */
export function parseAcpLine(line: string): StreamEvent[] {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];
  if (!trimmed.startsWith('{')) return [];
  let parsed: JsonRpcMessage;
  try {
    parsed = JSON.parse(trimmed) as JsonRpcMessage;
  } catch (err) {
    return [
      {
        kind: 'parse_error',
        raw: trimmed,
        message: err instanceof Error ? err.message : String(err),
      },
    ];
  }
  // session/update notification — the main event-bearing channel.
  if (parsed.method === 'session/update' && parsed.params) {
    return mapSessionUpdate(parsed.params as SessionUpdateParams);
  }
  // The agent's response to our `session/prompt` request — terminal.
  if (parsed.result && parsed.id !== undefined && parsed.method === undefined) {
    const r = parsed.result as PromptResponse;
    return [
      {
        kind: 'result',
        isError: false,
        text: typeof r.stop_reason === 'string' ? r.stop_reason : '',
        tokenUsage: null,
        durationMs: null,
        totalCostUsd: null,
      },
    ];
  }
  // Error responses translate to a failed terminal.
  if (parsed.error && parsed.id !== undefined) {
    const message = parsed.error.message ?? 'acp protocol error';
    const out: StreamEvent[] = [];
    const rl = detectRateLimitFromText(message);
    if (rl) out.push(rl);
    out.push({
      kind: 'result',
      isError: true,
      text: message,
      tokenUsage: null,
      durationMs: null,
      totalCostUsd: null,
    });
    return out;
  }
  return [];
}

function mapSessionUpdate(params: SessionUpdateParams): StreamEvent[] {
  const update = params.update;
  if (!update || typeof update !== 'object') return [];
  const type = (update as { type?: unknown }).type;
  if (typeof type !== 'string') return [];

  switch (type) {
    case 'agent_message_chunk': {
      const text = contentText((update as AgentMessageChunkUpdate).content);
      if (text.length === 0) return [];
      return [{ kind: 'text', text }];
    }
    case 'agent_thought_chunk':
      // Parity with claude/codex/gemini: planning chunks are dropped.
      return [];
    case 'tool_call': {
      const tc = update as ToolCallUpdate;
      if (typeof tc.tool_call_id !== 'string') return [];
      return [
        {
          kind: 'tool_use',
          toolUseId: tc.tool_call_id,
          name: typeof tc.title === 'string' ? tc.title : tc.kind ?? 'tool',
          input: tc.raw_input ?? null,
        },
      ];
    }
    case 'tool_call_update': {
      const tcu = update as ToolCallUpdateUpdate;
      if (typeof tcu.tool_call_id !== 'string') return [];
      const status = tcu.fields?.status;
      // Only completed/failed updates carry a tool_result. In-progress
      // notifications are status pings — drop them to match the codex
      // adapter's filter on `item.updated`.
      if (status !== 'completed' && status !== 'failed') return [];
      return [
        {
          kind: 'tool_result',
          toolUseId: tcu.tool_call_id,
          isError: status === 'failed',
          content: tcu.fields?.content ?? tcu.fields?.raw_output ?? null,
        },
      ];
    }
    default:
      return [];
  }
}
