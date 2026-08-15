import {
  detectRateLimit as detectRateLimitFromText,
  type StreamEvent,
} from '../stream-parser.js';
import type {
  AgentCliAdapter,
  BuildArgsInput,
  ComposePromptInput,
} from './types.js';

/**
 * SST OpenCode CLI adapter. Spawns `opencode` and parses its
 * line-delimited JSON output.
 */

interface OpencodePart {
  sessionID?: unknown;
  type?: unknown;
  text?: unknown;
  callID?: unknown;
  tool?: unknown;
  state?: {
    status?: unknown;
    input?: unknown;
    output?: unknown;
  };
  tokens?: {
    input?: unknown;
    output?: unknown;
  };
  reason?: unknown;
  cost?: unknown;
}

interface OpencodeEvent {
  type: string;
  sessionID?: unknown;
  part?: unknown;
  error?: unknown;
}

interface OpencodeAccum {
  input: number;
  output: number;
  cost: number;
  sessionId: string | null;
}

const accum: OpencodeAccum = { input: 0, output: 0, cost: 0, sessionId: null };
const SYSTEM_PROMPT_DELIMITER = '\n\n---\n\n';

export const opencodeCliAdapter: AgentCliAdapter = {
  command: 'opencode',
  promptDelivery: 'argv',
  mcpSupport: 'none',

  buildArgs(opts: BuildArgsInput): string[] {
    const args: string[] = ['run', '--format', 'json', '--auto'];
    // Continue the existing session so replies/approvals iterate on the
    // same conversation (--session is opencode's equivalent of claude's
    // --resume). Without this every turn spawns a fresh, context-free
    // session and the /spec approval loop never iterates.
    if (opts.resumeFromSessionId) {
      args.push('--session', opts.resumeFromSessionId);
    }
    if (opts.extraArgs && opts.extraArgs.length > 0) args.push(...opts.extraArgs);
    return args;
  },

  composePrompt(input: ComposePromptInput): string {
    if (!input.systemPrompt || input.systemPrompt.length === 0) {
      return input.prompt;
    }
    return `${input.systemPrompt}${SYSTEM_PROMPT_DELIMITER}${input.prompt}`;
  },

  parseLine(line: string): StreamEvent[] {
    const trimmed = line.trim();
    if (trimmed.length === 0 || !trimmed.startsWith('{')) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      return [
        {
          kind: 'parse_error',
          raw: trimmed,
          message: err instanceof Error ? err.message : String(err),
        },
      ];
    }

    if (!isRecord(parsed) || typeof parsed.type !== 'string') return [];
    return mapEvent(parsed as unknown as OpencodeEvent);
  },

  detectRateLimit(text: string) {
    return detectRateLimitFromText(text);
  },
};

function mapEvent(event: OpencodeEvent): StreamEvent[] {
  const part = isRecord(event.part) ? (event.part as OpencodePart) : null;
  const incomingSessionId = getSessionId(event, part);

  // The adapter is a module singleton. A changed session indicates a new
  // process stream, so discard any totals left by the previous one.
  if (incomingSessionId !== null && accum.sessionId !== null && incomingSessionId !== accum.sessionId) {
    resetAccum();
  }
  switch (event.type) {
    case 'step_start': {
      if (incomingSessionId === null) return [];
      if (accum.sessionId !== null) return [];
      accum.sessionId = incomingSessionId;
      return [{ kind: 'session', sessionId: incomingSessionId, model: null }];
    }
    case 'text': {
      const text = typeof part?.text === 'string' ? part.text : '';
      if (text.length === 0) return [];
      // Scan for kanbots-decision blocks so /spec approval loops pause
      // with a decision card (supervisor reacts to 'decision' events).
      // Without this the block renders as raw text and the run completes.
      return extractTextWithDecisions(text);
    }
    case 'tool_use': {
      if (part?.type !== 'tool') return [];
      const toolUseId = typeof part.callID === 'string' ? part.callID : null;
      const name = typeof part.tool === 'string' ? part.tool : null;
      if (toolUseId === null || name === null) return [];

      const events: StreamEvent[] = [
        {
          kind: 'tool_use',
          toolUseId,
          name,
          input: part.state?.input ?? null,
        },
      ];
      if (part.state?.output !== undefined) {
        events.push({
          kind: 'tool_result',
          toolUseId,
          isError: part.state?.status === 'error',
          content: part.state.output,
        });
      }
      return events;
    }
    case 'error': {
      // opencode emits {"type":"error","error":{name, data:{message}}}
      // on failures (bad --model, server errors, auth issues). Surface it
      // as a result so the run fails loudly instead of looking like a no-op.
      let message = 'unknown opencode error';
      if (isRecord(event.error)) {
        const data = isRecord(event.error.data) ? event.error.data : null;
        const raw =
          typeof data?.message === 'string'
            ? data.message
            : typeof event.error.message === 'string'
              ? event.error.message
              : null;
        if (raw !== null) message = raw;
      }
      return [
        {
          kind: 'result',
          isError: true,
          text: `opencode error: ${message}`,
          tokenUsage: null,
          durationMs: null,
          totalCostUsd: null,
        },
      ];
    }
    case 'step_finish': {
      if (part === null) return [];
      accum.input += Number(part.tokens?.input) || 0;
      accum.output += Number(part.tokens?.output) || 0;
      accum.cost += Number(part.cost) || 0;

      if (part.reason !== 'stop') return [];

      const result: StreamEvent = {
        kind: 'result',
        isError: false,
        text: '',
        tokenUsage: { input: accum.input, output: accum.output },
        durationMs: null,
        totalCostUsd: accum.cost,
      };
      resetAccum();
      return [result];
    }
    default:
      return [];
  }
}

function getSessionId(event: OpencodeEvent, part: OpencodePart | null): string | null {
  if (typeof event.sessionID === 'string') return event.sessionID;
  if (typeof part?.sessionID === 'string') return part.sessionID;
  return null;
}

const DECISION_BLOCK_RE = /```kanbots-decision\s*\n([\s\S]*?)\n```/g;

// Mirror of stream-parser.ts:extractTextEvents. Kept inline so the
// opencode adapter doesn't depend on an internal helper that may evolve
// separately for the Anthropic stream shape (same approach as codex).
function extractTextWithDecisions(text: string): StreamEvent[] {
  if (text.length === 0) return [];
  const out: StreamEvent[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(DECISION_BLOCK_RE)) {
    const before = text.slice(lastIndex, match.index ?? 0);
    if (before.trim().length > 0) out.push({ kind: 'text', text: before });
    const body = match[1] ?? '';
    const decision = parseDecisionBody(body);
    if (decision) out.push(decision);
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  const tail = text.slice(lastIndex);
  if (tail.trim().length > 0) out.push({ kind: 'text', text: tail });
  if (out.length === 0 && text.trim().length > 0) {
    out.push({ kind: 'text', text });
  }
  return out;
}

function parseDecisionBody(body: string): StreamEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const question = typeof obj.question === 'string' ? obj.question : null;
  const rawOptions = Array.isArray(obj.options) ? obj.options : null;
  if (!question || !rawOptions) return null;
  const options: Array<{ value: string; label: string }> = [];
  for (const opt of rawOptions) {
    if (typeof opt !== 'object' || opt === null) continue;
    const o = opt as Record<string, unknown>;
    const value = typeof o.value === 'string' ? o.value : null;
    const label = typeof o.label === 'string' ? o.label : value;
    if (value && label) options.push({ value, label });
  }
  if (options.length === 0) return null;
  return { kind: 'decision', question, options };
}

function resetAccum(): void {
  accum.input = 0;
  accum.output = 0;
  accum.cost = 0;
  accum.sessionId = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
