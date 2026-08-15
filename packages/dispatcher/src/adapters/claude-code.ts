import { detectRateLimit, parseStreamLine, type StreamEvent } from '../stream-parser.js';
import type { AgentCliAdapter, BuildArgsInput } from './types.js';

export const claudeCodeAdapter: AgentCliAdapter = {
  command: 'claude',
  promptDelivery: 'stdin',
  mcpSupport: 'file',
  buildArgs(opts: BuildArgsInput): string[] {
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
    ];
    if (opts.resumeFromSessionId) {
      args.push('--resume', opts.resumeFromSessionId);
    }
    if (opts.allowedTools) {
      args.push('--tools', opts.allowedTools);
    }
    if (opts.appendSystemPrompt) {
      args.push('--append-system-prompt', opts.appendSystemPrompt);
    }
    // Default to Claude Sonnet 5 when the caller doesn't pin a model, so
    // claude-code runs stay on the current smart model instead of falling
    // back to the CLI's built-in default. An explicit opts.model wins.
    args.push('--model', opts.model && opts.model.length > 0 ? opts.model : 'claude-sonnet-5');
    if (opts.extraArgs && opts.extraArgs.length > 0) {
      args.push(...opts.extraArgs);
    }
    return args;
  },
  parseLine(line: string): StreamEvent[] {
    return parseStreamLine(line);
  },
  detectRateLimit(text: string) {
    return detectRateLimit(text);
  },
};
