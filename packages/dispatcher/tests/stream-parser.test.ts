import { describe, expect, it } from 'vitest';
import { makeLineSplitter, parseStreamLine } from '../src/stream-parser.js';

const ASSISTANT_TEXT = JSON.stringify({
  type: 'assistant',
  message: {
    content: [{ type: 'text', text: 'Reading the file…' }],
  },
});

const ASSISTANT_TOOL_USE = JSON.stringify({
  type: 'assistant',
  message: {
    content: [
      { type: 'thinking', thinking: '...' },
      {
        type: 'tool_use',
        id: 'toolu_abc',
        name: 'Read',
        input: { file_path: '/tmp/a.txt' },
      },
    ],
  },
});

const USER_TOOL_RESULT = JSON.stringify({
  type: 'user',
  message: {
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_abc',
        content: 'Hello\n',
      },
    ],
  },
});

const USER_TOOL_RESULT_ERROR = JSON.stringify({
  type: 'user',
  message: {
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_x',
        content: 'permission denied',
        is_error: true,
      },
    ],
  },
});

const RESULT = JSON.stringify({
  type: 'result',
  is_error: false,
  result: 'final answer',
  duration_ms: 1234,
  total_cost_usd: 0.42,
  usage: { input_tokens: 100, output_tokens: 50 },
});

describe('parseStreamLine', () => {
  it('returns no events for blank lines', () => {
    expect(parseStreamLine('')).toEqual([]);
    expect(parseStreamLine('   ')).toEqual([]);
  });

  it('returns parse_error for invalid JSON', () => {
    const events = parseStreamLine('not json');
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('parse_error');
  });

  it('extracts assistant text content', () => {
    const events = parseStreamLine(ASSISTANT_TEXT);
    expect(events).toEqual([{ kind: 'text', text: 'Reading the file…' }]);
  });

  it('extracts tool_use, ignores thinking', () => {
    const events = parseStreamLine(ASSISTANT_TOOL_USE);
    expect(events).toEqual([
      {
        kind: 'tool_use',
        toolUseId: 'toolu_abc',
        name: 'Read',
        input: { file_path: '/tmp/a.txt' },
      },
    ]);
  });

  it('extracts tool_result from user content', () => {
    const events = parseStreamLine(USER_TOOL_RESULT);
    expect(events).toEqual([
      {
        kind: 'tool_result',
        toolUseId: 'toolu_abc',
        isError: false,
        content: 'Hello\n',
      },
    ]);
  });

  it('flags is_error on tool_result', () => {
    const events = parseStreamLine(USER_TOOL_RESULT_ERROR);
    expect(events[0]).toEqual({
      kind: 'tool_result',
      toolUseId: 'toolu_x',
      isError: true,
      content: 'permission denied',
    });
  });

  it('parses the result event with token usage and cost', () => {
    const events = parseStreamLine(RESULT);
    expect(events).toEqual([
      {
        kind: 'result',
        isError: false,
        text: 'final answer',
        tokenUsage: { input: 100, output: 50 },
        durationMs: 1234,
        totalCostUsd: 0.42,
      },
    ]);
  });

  it('emits a session event from system init', () => {
    const events = parseStreamLine(
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'abc-123',
        model: 'claude-opus-4-7',
      }),
    );
    expect(events).toEqual([{ kind: 'session', sessionId: 'abc-123', model: 'claude-opus-4-7' }]);
  });

  it('session event has null model when not provided', () => {
    const events = parseStreamLine(
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'abc' }),
    );
    expect(events).toEqual([{ kind: 'session', sessionId: 'abc', model: null }]);
  });

  it('ignores system non-init events (hooks, etc.) and rate_limit_event', () => {
    expect(parseStreamLine(JSON.stringify({ type: 'system', subtype: 'hook_started' }))).toEqual(
      [],
    );
    expect(parseStreamLine(JSON.stringify({ type: 'rate_limit_event' }))).toEqual([]);
  });

  it('extracts a decision block from text content', () => {
    const text = `Before the block\n\n\`\`\`kanbots-decision\n${JSON.stringify({
      question: 'Which?',
      options: [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' },
      ],
    })}\n\`\`\`\n\nAfter`;
    const events = parseStreamLine(
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text }] },
      }),
    );
    expect(events).toEqual([
      { kind: 'text', text: expect.stringContaining('Before the block') },
      {
        kind: 'decision',
        question: 'Which?',
        options: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
      },
      { kind: 'text', text: expect.stringContaining('After') },
    ]);
  });

  it('falls back to plain text when decision JSON is malformed', () => {
    const text = `\`\`\`kanbots-decision\nnot-json\n\`\`\``;
    const events = parseStreamLine(
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text }] },
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('text');
  });

  it('skips a decision block with no valid options', () => {
    const text = `\`\`\`kanbots-decision\n${JSON.stringify({
      question: 'Q',
      options: [{ value: 1 }],
    })}\n\`\`\``;
    const events = parseStreamLine(
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text }] },
      }),
    );
    expect(events.some((e) => e.kind === 'decision')).toBe(false);
  });

  it('skips empty text content', () => {
    const empty = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '' }] },
    });
    expect(parseStreamLine(empty)).toEqual([]);
  });
});

describe('makeLineSplitter', () => {
  it('splits chunked input on newlines and buffers partial last line', () => {
    const split = makeLineSplitter();
    expect(split('hello\nwor')).toEqual(['hello']);
    expect(split('ld\n')).toEqual(['world']);
  });

  it('handles multi-line chunks in one call', () => {
    const split = makeLineSplitter();
    expect(split('a\nb\nc\n')).toEqual(['a', 'b', 'c']);
  });

  it('drops empty lines', () => {
    const split = makeLineSplitter();
    expect(split('a\n\n\nb\n')).toEqual(['a', 'b']);
  });
});

describe('diff_hunk synthesis from tool_use', () => {
  function streamFor(toolName: string, input: Record<string, unknown>): unknown[] {
    return parseStreamLine(
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'toolu_x', name: toolName, input },
          ],
        },
      }),
    );
  }

  it('emits an Edit-derived diff_hunk alongside the tool_use', () => {
    const events = streamFor('Edit', {
      file_path: 'src/foo.ts',
      old_string: 'const x = 1;',
      new_string: 'const x = 2;',
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: 'tool_use', name: 'Edit' });
    expect(events[1]).toMatchObject({
      kind: 'diff_hunk',
      mode: 'edit',
      filePath: 'src/foo.ts',
      opIndex: 0,
      before: 'const x = 1;',
      after: 'const x = 2;',
    });
  });

  it('emits a Write-derived hunk with null before', () => {
    const events = streamFor('Write', {
      file_path: 'src/new.ts',
      content: 'export const x = 1;\n',
    });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      kind: 'diff_hunk',
      mode: 'write',
      before: null,
      after: 'export const x = 1;\n',
    });
  });

  it('expands MultiEdit into one hunk per op', () => {
    const events = streamFor('MultiEdit', {
      file_path: 'src/multi.ts',
      edits: [
        { old_string: 'a', new_string: 'b' },
        { old_string: 'c', new_string: 'd' },
        { old_string: 'e', new_string: 'f' },
      ],
    });
    // 1 tool_use + 3 hunks
    expect(events).toHaveLength(4);
    const hunks = events.slice(1) as Array<{ kind: string; opIndex: number; mode: string }>;
    expect(hunks.map((h) => h.opIndex)).toEqual([0, 1, 2]);
    expect(hunks.every((h) => h.mode === 'multiedit_op')).toBe(true);
  });

  it('does not synthesize hunks for non-edit tools', () => {
    const events = streamFor('Read', { file_path: '/tmp/x.txt' });
    expect(events).toHaveLength(1);
    expect((events[0] as { kind: string }).kind).toBe('tool_use');
  });

  it('skips a malformed Edit (missing fields)', () => {
    const events = streamFor('Edit', { file_path: 'src/foo.ts' });
    // tool_use still emits but no hunk synthesised
    expect(events).toHaveLength(1);
  });
});
