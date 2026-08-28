import { describe, expect, it } from 'vitest';
import { createDecisionStreamFilter } from '../src/stream-parser.js';
import type { StreamEvent } from '../src/stream-parser.js';

const DECISION_JSON = JSON.stringify(
  {
    question: 'Approve this acceptance criteria list?',
    options: [
      { value: 'approve', label: 'Approve and start implementation' },
      { value: 'edit', label: 'Edit the criteria' },
      { value: 'cancel', label: 'Cancel the task' },
    ],
  },
  null,
  2,
);

const DECISION_BLOCK = `\`\`\`kodra-decision\n${DECISION_JSON}\n\`\`\``;

function text(t: string): StreamEvent {
  return { kind: 'text', text: t };
}

function joinedText(events: StreamEvent[]): string {
  return events
    .filter((e): e is Extract<StreamEvent, { kind: 'text' }> => e.kind === 'text')
    .map((e) => e.text)
    .join('');
}

describe('createDecisionStreamFilter', () => {
  it('extracts a decision block split across arbitrary deltas', () => {
    const filter = createDecisionStreamFilter();
    const full = `Here is the spec.\n\n${DECISION_BLOCK}\n\nDone.`;
    const out: StreamEvent[] = [];
    // 7-char deltas: the fence header, JSON body and closer all get split.
    for (let i = 0; i < full.length; i += 7) {
      out.push(...filter.push([text(full.slice(i, i + 7))]));
    }
    out.push(...filter.flush());

    const decisions = out.filter((e) => e.kind === 'decision');
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      kind: 'decision',
      question: 'Approve this acceptance criteria list?',
    });
    expect(joinedText(out)).toBe('Here is the spec.\n\n\n\nDone.');
  });

  it('passes plain text through unchanged when no fence is present', () => {
    const filter = createDecisionStreamFilter();
    const out = [
      ...filter.push([text('Investigating…'), text(' Still going.')]),
      ...filter.push([text(' More.')]),
      ...filter.flush(),
    ];
    expect(out.every((e) => e.kind === 'text')).toBe(true);
    expect(joinedText(out)).toBe('Investigating… Still going. More.');
  });

  it('emits text before a normal fence immediately and the fence once typed out', () => {
    const filter = createDecisionStreamFilter();
    const out: StreamEvent[] = [];
    out.push(...filter.push([text('Look:\n\n```js\n')]));
    // '```j' is provably not a decision opener (4th char ≠ 'k'), so the
    // whole prefix streams through without waiting for the closer.
    expect(joinedText(out)).toBe('Look:\n\n```js\n');
    out.push(...filter.push([text('console.log(1);\n```\nAfter.')]));
    out.push(...filter.flush());
    expect(out.every((e) => e.kind === 'text')).toBe(true);
    expect(joinedText(out)).toBe('Look:\n\n```js\nconsole.log(1);\n```\nAfter.');
  });

  it('keeps a malformed decision block as visible text', () => {
    const filter = createDecisionStreamFilter();
    const out = [
      ...filter.push([text('```kodra-decision\nnot-json\n```')]),
      ...filter.flush(),
    ];
    expect(out.some((e) => e.kind === 'decision')).toBe(false);
    expect(joinedText(out)).toBe('```kodra-decision\nnot-json\n```');
  });

  it('flushes an unterminated fence as text at end of stream', () => {
    const filter = createDecisionStreamFilter();
    const out = [...filter.push([text('Partial:\n```kanbots-deci')]), ...filter.flush()];
    expect(joinedText(out)).toBe('Partial:\n```kanbots-deci');
  });

  it('passes non-text events through untouched and in order', () => {
    const filter = createDecisionStreamFilter();
    const toolUse: StreamEvent = {
      kind: 'tool_use',
      toolUseId: 't1',
      name: 'Read',
      input: null,
    };
    const result: StreamEvent = {
      kind: 'result',
      isError: false,
      text: '',
      tokenUsage: null,
      durationMs: null,
      totalCostUsd: null,
    };
    const out = [...filter.push([text('hi'), toolUse, result]), ...filter.flush()];
    expect(out).toEqual([text('hi'), toolUse, result]);
  });

  it('extracts two consecutive decision blocks', () => {
    const filter = createDecisionStreamFilter();
    const full = `${DECISION_BLOCK}\nmiddle\n${DECISION_BLOCK}`;
    const out: StreamEvent[] = [];
    for (let i = 0; i < full.length; i += 11) {
      out.push(...filter.push([text(full.slice(i, i + 11))]));
    }
    out.push(...filter.flush());
    const decisions = out.filter((e) => e.kind === 'decision');
    expect(decisions).toHaveLength(2);
    expect(joinedText(out)).toContain('middle');
  });
});
