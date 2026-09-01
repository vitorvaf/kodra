import { describe, expect, it } from 'vitest';
import { startAgentRun } from '../src/worker.js';
import type { StreamEvent } from '../src/stream-parser.js';
import { makeFakeSpawn } from './helpers/fake-spawn.js';

const ASSISTANT_TEXT = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'text', text: 'thinking aloud' }] },
});
const TOOL_USE = JSON.stringify({
  type: 'assistant',
  message: {
    content: [
      {
        type: 'tool_use',
        id: 't1',
        name: 'Read',
        input: { file_path: 'a.txt' },
      },
    ],
  },
});
const TOOL_RESULT = JSON.stringify({
  type: 'user',
  message: {
    content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file body' }],
  },
});
const RESULT = JSON.stringify({
  type: 'result',
  is_error: false,
  result: 'all done',
  duration_ms: 4321,
  total_cost_usd: 0.05,
  usage: { input_tokens: 9, output_tokens: 4 },
});

describe('startAgentRun', () => {
  it('passes the expected claude flags and the prompt over stdin', async () => {
    const fake = makeFakeSpawn({ stdout: RESULT + '\n' });
    const handle = startAgentRun({
      cwd: '/wt',
      prompt: 'do the thing',
      spawn: fake.fn,
    });
    await handle.done;

    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.command).toBe('claude');
    expect(call.cwd).toBe('/wt');
    expect(call.args).toContain('-p');
    expect(call.args).toContain('--output-format');
    expect(call.args).toContain('stream-json');
    expect(call.args).toContain('--permission-mode');
    expect(call.args).toContain('bypassPermissions');
    expect(call.args).not.toContain('--no-session-persistence');
    expect(call.stdin).toBe('do the thing');
  });

  it('passes --resume when resumeFromSessionId is provided', async () => {
    const fake = makeFakeSpawn({ stdout: RESULT + '\n' });
    const handle = startAgentRun({
      cwd: '/wt',
      prompt: 'continue',
      resumeFromSessionId: 'session-123',
      spawn: fake.fn,
    });
    await handle.done;
    const args = fake.calls[0]!.args;
    expect(args).toContain('--resume');
    expect(args[args.indexOf('--resume') + 1]).toBe('session-123');
  });

  it('emits parsed events as they arrive on stdout', async () => {
    const stdout = [ASSISTANT_TEXT, TOOL_USE, TOOL_RESULT, RESULT].join('\n') + '\n';
    const fake = makeFakeSpawn({ stdout });
    const handle = startAgentRun({ cwd: '/wt', prompt: 'p', spawn: fake.fn });

    const collected: StreamEvent[] = [];
    handle.on('event', (e) => collected.push(e));
    await handle.done;

    expect(collected.map((e) => e.kind)).toEqual(['text', 'tool_use', 'tool_result', 'result']);
  });

  it('captures the final result on close', async () => {
    const stdout = [ASSISTANT_TEXT, RESULT].join('\n') + '\n';
    const fake = makeFakeSpawn({ stdout });
    const handle = startAgentRun({ cwd: '/wt', prompt: 'p', spawn: fake.fn });

    const summary = await handle.done;
    expect(summary.exitCode).toBe(0);
    expect(summary.result).toEqual({
      isError: false,
      text: 'all done',
      tokenUsage: { input: 9, output: 4 },
      durationMs: 4321,
      totalCostUsd: 0.05,
    });
    expect(summary.killedByStop).toBe(false);
  });

  it('captures stderr on close', async () => {
    const fake = makeFakeSpawn({
      stdout: RESULT + '\n',
      stderr: 'a warning\n',
    });
    const handle = startAgentRun({ cwd: '/wt', prompt: 'p', spawn: fake.fn });
    const summary = await handle.done;
    expect(summary.stderr).toContain('a warning');
  });

  it('stop() sends SIGTERM and marks killedByStop', async () => {
    const fake = makeFakeSpawn({ hangs: true });
    const handle = startAgentRun({ cwd: '/wt', prompt: 'p', spawn: fake.fn });

    setImmediate(() => handle.stop());
    const summary = await handle.done;
    expect(summary.killedByStop).toBe(true);
    expect(fake.killSignals).toContain('SIGTERM');
  });

  it('emits error event on spawn failure', async () => {
    const fake = makeFakeSpawn({
      errorOnSpawn: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }),
    });
    const handle = startAgentRun({ cwd: '/wt', prompt: 'p', spawn: fake.fn });

    let received: Error | null = null;
    handle.on('error', (e) => (received = e));
    const summary = await handle.done;
    expect(received).not.toBeNull();
    expect((received as unknown as Error).message).toContain('ENOENT');
    expect(summary.exitCode).toBeNull();
  });

  it('appends system prompt and tools when provided', async () => {
    const fake = makeFakeSpawn({ stdout: RESULT + '\n' });
    const handle = startAgentRun({
      cwd: '/wt',
      prompt: 'p',
      appendSystemPrompt: 'EXTRA',
      allowedTools: 'Read,Bash',
      spawn: fake.fn,
    });
    await handle.done;
    const args = fake.calls[0]!.args;
    expect(args).toContain('--append-system-prompt');
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('EXTRA');
    expect(args).toContain('--tools');
    expect(args[args.indexOf('--tools') + 1]).toBe('Read,Bash');
  });

  it('handles chunked stdout split mid-line', async () => {
    const fake = makeFakeSpawn({
      stdout: ASSISTANT_TEXT + '\n' + RESULT + '\n',
    });
    const handle = startAgentRun({ cwd: '/wt', prompt: 'p', spawn: fake.fn });

    const collected: StreamEvent[] = [];
    handle.on('event', (e) => collected.push(e));
    await handle.done;
    expect(collected.map((e) => e.kind)).toEqual(['text', 'result']);
  });
});
