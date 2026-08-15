import { describe, expect, it } from 'vitest';
import { acpAdapter } from '../src/adapters/acp.js';
import { agyCliAdapter } from '../src/adapters/agy-cli.js';
import { ccrCliAdapter } from '../src/adapters/ccr-cli.js';
import { claudeCodeAdapter } from '../src/adapters/claude-code.js';
import { copilotCliAdapter } from '../src/adapters/copilot-cli.js';
import { cursorCliAdapter } from '../src/adapters/cursor-cli.js';
import { droidCliAdapter } from '../src/adapters/droid-cli.js';
import { opencodeCliAdapter } from '../src/adapters/opencode-cli.js';
import { qwenCliAdapter } from '../src/adapters/qwen-cli.js';
import type { StreamEvent } from '../src/stream-parser.js';

function feed(lines: readonly string[], parse: (line: string) => StreamEvent[]): StreamEvent[] {
  const out: StreamEvent[] = [];
  for (const line of lines) {
    out.push(...parse(line));
  }
  return out;
}

describe('agyCliAdapter', () => {
  it('builds headless stream-json args and maps model, conversation, and extras', () => {
    expect(agyCliAdapter.buildArgs({})).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--dangerously-skip-permissions',
    ]);
    expect(agyCliAdapter.buildArgs({
      model: 'gemini-3.6-flash-low',
      resumeFromSessionId: 'conversation-1',
      extraArgs: ['--verbose'],
    })).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--dangerously-skip-permissions',
      '--model',
      'gemini-3.6-flash-low',
      '--conversation',
      'conversation-1',
      '--verbose',
    ]);
    // `default` is the catalogue placeholder for "let agy pick" — it must
    // never reach argv (the CLI rejects unknown model slugs with exit 1).
    expect(agyCliAdapter.buildArgs({ model: 'default' })).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--dangerously-skip-permissions',
    ]);
  });

  it('parses init, step updates, results, ignored output, and malformed JSON', () => {
    const events = feed([
      JSON.stringify({ event: 'init', conversation_id: 'conversation-1' }),
      JSON.stringify({ event: 'step_update', step_update: { text_delta: 'Hello' } }),
      JSON.stringify({
        event: 'step_update',
        step_update: { tool_use: { id: 'tool-1', name: 'Read', input: { path: 'a.ts' } } },
      }),
      JSON.stringify({
        event: 'result',
        result: {
          status: 'SUCCESS',
          response: 'done',
          duration_seconds: 1.25,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      }),
      'status: working',
      '{malformed',
    ], (line) => agyCliAdapter.parseLine(line));

    expect(events.map((event) => event.kind)).toEqual([
      'session',
      'text',
      'tool_use',
      'result',
      'parse_error',
    ]);
    expect(events[0]).toEqual({ kind: 'session', sessionId: 'conversation-1', model: null });
    expect(events[3]).toEqual({
      kind: 'result',
      isError: false,
      text: 'done',
      tokenUsage: { input: 10, output: 5 },
      durationMs: 1250,
      totalCostUsd: null,
    });
  });

  it('maps a non-success result to an error result', () => {
    expect(agyCliAdapter.parseLine(JSON.stringify({
      event: 'result',
      result: { status: 'ERROR', response: 'failed' },
    }))).toEqual([{
      kind: 'result',
      isError: true,
      text: 'failed',
      tokenUsage: null,
      durationMs: null,
      totalCostUsd: null,
    }]);
  });
});

describe('claudeCodeAdapter', () => {
  it('defaults to claude-sonnet-5 when no model is provided', () => {
    const args = claudeCodeAdapter.buildArgs({});
    expect(args).toContain('--model');
    expect(args).toContain('claude-sonnet-5');
  });

  it('keeps an explicitly provided model instead of the default', () => {
    const args = claudeCodeAdapter.buildArgs({ model: 'claude-opus-4-7' });
    expect(args).toContain('--model');
    expect(args).toContain('claude-opus-4-7');
    expect(args).not.toContain('claude-sonnet-5');
  });
});

describe('cursorCliAdapter', () => {
  it('builds the expected flags with --force and a default `auto` model', () => {
    const args = cursorCliAdapter.buildArgs({});
    expect(args).toContain('-p');
    expect(args).toContain('--output-format=stream-json');
    expect(args).toContain('--force');
    expect(args).toContain('--model');
    expect(args).toContain('auto');
  });

  it('parses system/assistant/tool_call/result into a normalized stream', () => {
    const lines = [
      JSON.stringify({
        type: 'system',
        session_id: 'sess-abc',
        model: 'gpt-5.4',
      }),
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Working.' }] },
      }),
      JSON.stringify({
        type: 'tool_call',
        subtype: 'started',
        call_id: 'tc-1',
        tool_call: { readToolCall: { args: { file_path: 'README.md' } } },
      }),
      JSON.stringify({
        type: 'tool_call',
        subtype: 'completed',
        call_id: 'tc-1',
        tool_call: { readToolCall: { args: {}, result: 'hello' } },
      }),
      JSON.stringify({ type: 'result', is_error: false, duration_ms: 1234 }),
    ];
    const events = feed(lines, (l) => cursorCliAdapter.parseLine(l));
    expect(events.map((e) => e.kind)).toEqual([
      'session',
      'text',
      'tool_use',
      'tool_result',
      'result',
    ]);
    const toolUse = events[2];
    expect(toolUse).toBeDefined();
    if (toolUse?.kind === 'tool_use') {
      expect(toolUse.name).toBe('Read');
      expect(toolUse.toolUseId).toBe('tc-1');
    }
  });

  it('drops thinking events', () => {
    const events = cursorCliAdapter.parseLine(
      JSON.stringify({ type: 'thinking', text: 'pondering' }),
    );
    expect(events).toHaveLength(0);
  });
});

describe('droidCliAdapter', () => {
  it('builds with --skip-permissions-unsafe by default', () => {
    const args = droidCliAdapter.buildArgs({});
    expect(args[0]).toBe('exec');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--skip-permissions-unsafe');
  });

  it('parses system/message/tool_call/tool_result/result events', () => {
    const lines = [
      JSON.stringify({ type: 'system', session_id: 'droid-1', model: 'droid-1' }),
      JSON.stringify({ type: 'message', role: 'assistant', text: 'hi' }),
      JSON.stringify({
        type: 'tool_call',
        id: 't-1',
        tool_name: 'Read',
        parameters: { file_path: 'a.txt' },
      }),
      JSON.stringify({
        type: 'tool_result',
        tool_use_id: 't-1',
        output: 'contents',
        is_error: false,
      }),
      JSON.stringify({
        type: 'result',
        is_error: false,
        duration_ms: 100,
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    ];
    const events = feed(lines, (l) => droidCliAdapter.parseLine(l));
    expect(events.map((e) => e.kind)).toEqual([
      'session',
      'text',
      'tool_use',
      'tool_result',
      'result',
    ]);
  });

  it('drops user/system message echoes (only assistant text becomes transcript)', () => {
    const events = droidCliAdapter.parseLine(
      JSON.stringify({ type: 'message', role: 'user', text: 'echo' }),
    );
    expect(events).toHaveLength(0);
  });
});

describe('opencodeCliAdapter', () => {
  it('builds with the opencode 1.17.20 flags and ignores the kanbots model', () => {
    expect(opencodeCliAdapter.buildArgs({})).toEqual(['run', '--format', 'json', '--auto']);
    expect(opencodeCliAdapter.buildArgs({ model: 'whatever' })).toEqual([
      'run',
      '--format',
      'json',
      '--auto',
    ]);
  });

  it('maps resumeFromSessionId to --session so replies iterate the same session', () => {
    expect(opencodeCliAdapter.buildArgs({ resumeFromSessionId: 'ses_abc' })).toEqual([
      'run',
      '--format',
      'json',
      '--auto',
      '--session',
      'ses_abc',
    ]);
  });

  it('parses a real step_start envelope into one session event', () => {
    const events = opencodeCliAdapter.parseLine(
      JSON.stringify({
        type: 'step_start',
        timestamp: 1710000000000,
        sessionID: 'ses_start',
        part: {
          id: 'prt_start',
          messageID: 'msg_start',
          sessionID: 'ses_start',
          snapshot: 'snapshot',
          type: 'step-start',
        },
      }),
    );
    expect(events).toEqual([{ kind: 'session', sessionId: 'ses_start', model: null }]);
  });

  it('parses a real text envelope', () => {
    const events = opencodeCliAdapter.parseLine(
      JSON.stringify({
        type: 'text',
        timestamp: 1710000000001,
        sessionID: 'ses_start',
        part: { id: 'prt_text', messageID: 'msg_start', type: 'text', text: 'PING' },
      }),
    );
    expect(events).toEqual([{ kind: 'text', text: 'PING' }]);
  });

  it('extracts a kanbots-decision block from a text envelope as a decision event', () => {
    const decision = JSON.stringify({
      question: 'Approve this acceptance criteria list?',
      options: [
        { value: 'approve', label: 'Approve and start implementation' },
        { value: 'edit', label: 'Edit the criteria' },
        { value: 'cancel', label: 'Cancel the task' },
      ],
    });
    const events = opencodeCliAdapter.parseLine(
      JSON.stringify({
        type: 'text',
        timestamp: 1710000000001,
        sessionID: 'ses_start',
        part: {
          id: 'prt_text',
          messageID: 'msg_start',
          type: 'text',
          text: `Here is the spec.\n\n\`\`\`kanbots-decision\n${decision}\n\`\`\`\n`,
        },
      }),
    );
    expect(events).toEqual([
      { kind: 'text', text: 'Here is the spec.\n\n' },
      {
        kind: 'decision',
        question: 'Approve this acceptance criteria list?',
        options: [
          { value: 'approve', label: 'Approve and start implementation' },
          { value: 'edit', label: 'Edit the criteria' },
          { value: 'cancel', label: 'Cancel the task' },
        ],
      },
    ]);
  });

  it('maps an error envelope to a failing result instead of dropping it', () => {
    const events = opencodeCliAdapter.parseLine(
      JSON.stringify({
        type: 'error',
        timestamp: 1710000000003,
        sessionID: 'ses_start',
        error: {
          name: 'UnknownError',
          data: { message: 'Unexpected server error. Check server logs for details.' },
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: 'result',
        isError: true,
        text: 'opencode error: Unexpected server error. Check server logs for details.',
        tokenUsage: null,
        durationMs: null,
        totalCostUsd: null,
      },
    ]);
  });

  it('parses a completed tool_use envelope into tool_use and tool_result', () => {
    const events = opencodeCliAdapter.parseLine(
      JSON.stringify({
        type: 'tool_use',
        timestamp: 1710000000002,
        sessionID: 'ses_start',
        part: {
          type: 'tool',
          tool: 'read',
          callID: 'call_read',
          state: {
            status: 'completed',
            input: { filePath: '/tmp/foo' },
            output: 'file contents',
            metadata: {},
          },
        },
      }),
    );
    expect(events.map((e) => e.kind)).toEqual(['tool_use', 'tool_result']);
    expect(events[0]).toEqual({
      kind: 'tool_use',
      toolUseId: 'call_read',
      name: 'read',
      input: { filePath: '/tmp/foo' },
    });
    expect(events[1]).toEqual({
      kind: 'tool_result',
      toolUseId: 'call_read',
      isError: false,
      content: 'file contents',
    });
  });

  it('accumulates per-step tokens and cost until the terminal step_finish', () => {
    const events = feed(
      [
        JSON.stringify({
          type: 'step_start',
          timestamp: 1710000000010,
          sessionID: 'ses_accum',
          part: { sessionID: 'ses_accum', type: 'step-start' },
        }),
        JSON.stringify({
          type: 'step_finish',
          timestamp: 1710000000011,
          sessionID: 'ses_accum',
          part: {
            reason: 'tool-calls',
            type: 'step-finish',
            tokens: { total: 12000, input: 578, output: 94, reasoning: 0 },
            cost: 0.12,
          },
        }),
        JSON.stringify({
          type: 'step_start',
          timestamp: 1710000000012,
          sessionID: 'ses_accum',
          part: { sessionID: 'ses_accum', type: 'step-start' },
        }),
        JSON.stringify({
          type: 'step_finish',
          timestamp: 1710000000013,
          sessionID: 'ses_accum',
          part: {
            reason: 'stop',
            type: 'step-finish',
            tokens: { total: 18948, input: 321, output: 100, reasoning: 0 },
            cost: 0.08,
          },
        }),
      ],
      (line) => opencodeCliAdapter.parseLine(line),
    );
    expect(events.filter((event) => event.kind === 'result')).toHaveLength(1);
    expect(events.at(-1)).toEqual({
      kind: 'result',
      isError: false,
      text: '',
      tokenUsage: { input: 899, output: 194 },
      durationMs: null,
      totalCostUsd: 0.2,
    });
  });

  it('resets accumulation and emits a session for a new session after a terminal result', () => {
    const events = opencodeCliAdapter.parseLine(
      JSON.stringify({
        type: 'step_start',
        timestamp: 1710000000020,
        sessionID: 'ses_new',
        part: { sessionID: 'ses_new', type: 'step-start' },
      }),
    );
    expect(events).toEqual([{ kind: 'session', sessionId: 'ses_new', model: null }]);
  });
});

describe('qwenCliAdapter', () => {
  it('builds with --yolo', () => {
    const args = qwenCliAdapter.buildArgs({});
    expect(args).toContain('--yolo');
    expect(args).toContain('--output-format');
    expect(args).toContain('json-stream');
  });

  it('parses gemini-style stream events', () => {
    const lines = [
      JSON.stringify({ type: 'session', session_id: 'q-1', model: 'qwen3-coder-plus' }),
      JSON.stringify({ type: 'message', text: 'thinking through it' }),
      JSON.stringify({
        type: 'tool_use',
        id: 'tu-1',
        name: 'Read',
        input: { file_path: 'a.ts' },
      }),
      JSON.stringify({
        type: 'tool_result',
        tool_use_id: 'tu-1',
        output: 'file body',
        is_error: false,
      }),
      JSON.stringify({ type: 'result', exit_code: 0, duration_ms: 200 }),
    ];
    const events = feed(lines, (l) => qwenCliAdapter.parseLine(l));
    expect(events.map((e) => e.kind)).toEqual([
      'session',
      'text',
      'tool_use',
      'tool_result',
      'result',
    ]);
  });
});

describe('ccrCliAdapter', () => {
  it('inherits claude-code flags under the `code` subcommand', () => {
    const args = ccrCliAdapter.buildArgs({});
    expect(args[0]).toBe('code');
    expect(args).toContain('-p');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--permission-mode');
    expect(args).toContain('bypassPermissions');
  });

  it('parses the standard Anthropic stream envelope (delegates to parseStreamLine)', () => {
    const events = ccrCliAdapter.parseLine(
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'reply' }] },
      }),
    );
    expect(events.map((e) => e.kind)).toEqual(['text']);
  });
});

describe('copilotCliAdapter + ACP parser', () => {
  it('spawns via npx with --acp and the permissive flag', () => {
    expect(copilotCliAdapter.command).toBe('npx');
    const args = copilotCliAdapter.buildArgs({});
    expect(args).toContain('-y');
    expect(args).toContain('@github/copilot');
    expect(args).toContain('--acp');
    expect(args).toContain('--allow-all-tools');
  });

  it('parses session/update notifications into text + tool events', () => {
    const lines = [
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          session_id: 's1',
          update: {
            type: 'agent_message_chunk',
            content: { type: 'text', text: 'Hello' },
          },
        },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          session_id: 's1',
          update: {
            type: 'tool_call',
            tool_call_id: 'tc-acp',
            title: 'Bash',
            raw_input: { command: 'ls' },
          },
        },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          session_id: 's1',
          update: {
            type: 'tool_call_update',
            tool_call_id: 'tc-acp',
            fields: { status: 'completed', content: 'file1 file2' },
          },
        },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { stop_reason: 'end_turn' },
      }),
    ];
    const events = feed(lines, (l) => copilotCliAdapter.parseLine(l));
    expect(events.map((e) => e.kind)).toEqual([
      'text',
      'tool_use',
      'tool_result',
      'result',
    ]);
  });
});

describe('acpAdapter', () => {
  it('defaults to the gemini ACP server', () => {
    expect(acpAdapter.command).toBe('gemini');
    const args = acpAdapter.buildArgs({});
    expect(args).toContain('--experimental-acp');
    expect(args).toContain('--yolo');
  });

  it('shares the ACP parser', () => {
    const events = acpAdapter.parseLine(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          session_id: 's1',
          update: {
            type: 'agent_message_chunk',
            content: { type: 'text', text: 'hello' },
          },
        },
      }),
    );
    expect(events.map((e) => e.kind)).toEqual(['text']);
  });
});
