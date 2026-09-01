import { detectRateLimit, parseStreamLine, type StreamEvent } from '../stream-parser.js';
import type { AgentCliAdapter, BuildArgsInput } from './types.js';

export const claudeCodeAdapter: AgentCliAdapter = {
  command: 'claude',
  promptDelivery: 'stdin',
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
    if (opts.model) {
      args.push('--model', opts.model);
    }
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
