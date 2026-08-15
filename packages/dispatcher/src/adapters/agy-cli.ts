import {
  detectRateLimit as detectRateLimitFromText,
  type StreamEvent,
} from '../stream-parser.js';
import type {
  AgentCliAdapter,
  BuildArgsInput,
  ComposePromptInput,
} from './types.js';

const SYSTEM_PROMPT_DELIMITER = '\n\n---\n\n';

/**
 * Google Antigravity CLI adapter. Requires agy >= 1.1.1 for piped stdout.
 * The CLI emits one JSON object per line with --output-format stream-json.
 */
export const agyCliAdapter: AgentCliAdapter = {
  command: 'agy',
  promptDelivery: 'argv',
  mcpSupport: 'config-dir',

  buildArgs(opts: BuildArgsInput): string[] {
    const args: string[] = [
      '-p',
      '--output-format',
      'stream-json',
      '--dangerously-skip-permissions',
    ];
    // `default` is the catalogue placeholder for "let agy pick" — the CLI
    // has no such slug and rejects it with exit 1, so it must not reach argv.
    if (opts.model && opts.model !== 'default') {
      args.push('--model', opts.model);
    }
    if (opts.resumeFromSessionId) {
      args.push('--conversation', opts.resumeFromSessionId);
    }
    if (opts.extraArgs && opts.extraArgs.length > 0) {
      args.push(...opts.extraArgs);
    }
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
    if (!isRecord(parsed) || typeof parsed.event !== 'string') return [];
    return mapEvent(parsed);
  },

  detectRateLimit(text: string) {
    return detectRateLimitFromText(text);
  },
};

function mapEvent(event: Record<string, unknown>): StreamEvent[] {
  switch (event.event) {
    case 'init': {
      const conversationId = event.conversation_id;
      if (typeof conversationId !== 'string') return [];
      return [{ kind: 'session', sessionId: conversationId, model: null }];
    }
    case 'step_update':
      return mapStepUpdate(event.step_update);
    case 'result':
      return mapResult(event.result);
    default:
      return [];
  }
}

function mapStepUpdate(value: unknown): StreamEvent[] {
  if (!isRecord(value)) return [];
  const out: StreamEvent[] = [];

  if (typeof value.text_delta === 'string' && value.text_delta.length > 0) {
    out.push({ kind: 'text', text: value.text_delta });
  }

  const toolUse = value.tool_use;
  if (isRecord(toolUse)) {
    const id = toolUse.id;
    const name = toolUse.name;
    if (typeof id === 'string' && typeof name === 'string') {
      out.push({
        kind: 'tool_use',
        toolUseId: id,
        name,
        input: toolUse.input ?? null,
      });
    }
  }

  for (const candidate of toolResultCandidates(value)) {
    const toolUseId = candidate.tool_use_id ?? candidate.id;
    if (typeof toolUseId !== 'string') continue;
    out.push({
      kind: 'tool_result',
      toolUseId,
      isError: candidate.is_error === true,
      content: candidate.output ?? candidate.content ?? candidate.result ?? null,
    });
  }
  return out;
}

function toolResultCandidates(value: Record<string, unknown>): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const singular = value.tool_result;
  if (isRecord(singular)) candidates.push(singular);
  if (Array.isArray(singular)) {
    for (const result of singular) {
      if (isRecord(result)) candidates.push(result);
    }
  }
  const plural = value.tool_results;
  if (Array.isArray(plural)) {
    for (const result of plural) {
      if (isRecord(result)) candidates.push(result);
    }
  }
  return candidates;
}

function mapResult(value: unknown): StreamEvent[] {
  if (!isRecord(value)) return [];
  const status = value.status;
  const isError = status !== 'SUCCESS';
  const usage = isRecord(value.usage) ? value.usage : undefined;
  const durationSeconds = value.duration_seconds;
  return [
    {
      kind: 'result',
      isError,
      text: typeof value.response === 'string' ? value.response : '',
      tokenUsage: tokenUsageFrom(usage),
      durationMs: typeof durationSeconds === 'number' ? durationSeconds * 1000 : null,
      totalCostUsd: null,
    },
  ];
}

function tokenUsageFrom(
  usage: Record<string, unknown> | undefined,
): { input: number; output: number } | null {
  if (
    !usage ||
    typeof usage.input_tokens !== 'number' ||
    typeof usage.output_tokens !== 'number'
  ) {
    return null;
  }
  return { input: usage.input_tokens, output: usage.output_tokens };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
