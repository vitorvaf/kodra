import { describe, expect, it } from 'vitest';
import { ComposerError, createSuggester } from '../src/composer.js';
import { makeFakeSpawn } from './helpers/fake-spawn.js';

const BACKLOG = [{ title: 'Existing thing', status: 'done' as const }];

function opencodeStream(finalJson: string): string {
  // opencode emits text deltas that accumulate into the final message; the
  // step_finish result carries usage but an empty text.
  return [
    JSON.stringify({ type: 'step_start', sessionID: 'sess-1' }),
    JSON.stringify({ type: 'text', part: { type: 'text', text: finalJson, sessionID: 'sess-1' } }),
    JSON.stringify({
      type: 'step_finish',
      part: { type: 'finish', reason: 'stop', sessionID: 'sess-1', tokens: { input: 10, output: 5 } },
    }),
    '',
  ].join('\n');
}

function agyResult(finalJson: string): string {
  // agy carries the final response on the result event.
  return [
    JSON.stringify({ event: 'init', conversation_id: 'c-1' }),
    JSON.stringify({
      event: 'result',
      result: { status: 'SUCCESS', response: finalJson, usage: { input_tokens: 3, output_tokens: 4 }, duration_seconds: 1 },
    }),
    '',
  ].join('\n');
}

describe('createSuggester generic adapter path', () => {
  it('ideates through the opencode CLI (argv prompt, text-event accumulation)', async () => {
    const fake = makeFakeSpawn({
      stdout: opencodeStream(JSON.stringify({ title: 'Add dark mode', body: 'body text' })),
    });
    const suggest = createSuggester({ cwd: '/r', spawn: fake.fn });

    const result = await suggest({
      backlog: BACKLOG,
      personaPrompt: 'polish advocate',
      provider: 'opencode-cli',
    });

    expect(result).toEqual({ title: 'Add dark mode', body: 'body text' });
    const call = fake.calls[0]!;
    expect(call.command).toBe('opencode');
    expect(call.args).toContain('run');
    // argv delivery: the composed prompt is the last argument
    expect(call.args[call.args.length - 1]).toContain('polish advocate');
    // the JSON output contract rides along in the prompt
    expect(call.args[call.args.length - 1]).toContain('OUTPUT REQUIREMENT');
  });

  it('ideates through the agy CLI (result-event text)', async () => {
    const fake = makeFakeSpawn({
      stdout: agyResult(JSON.stringify({ title: 'Ship it', body: 'b' })),
    });
    const suggest = createSuggester({ cwd: '/r', spawn: fake.fn });

    const result = await suggest({
      backlog: BACKLOG,
      personaPrompt: 'p',
      provider: 'agy-cli',
    });

    expect(result).toEqual({ title: 'Ship it', body: 'b' });
    const call = fake.calls[0]!;
    expect(call.command).toBe('agy');
    expect(call.args).toContain('--output-format');
    expect(call.args).toContain('stream-json');
    // -p must sit immediately before the prompt (agy binds the next token)
    const pIndex = call.args.indexOf('-p');
    expect(pIndex).toBe(call.args.length - 2);
  });

  it('never passes the placeholder model "default" to the CLI', async () => {
    const fake = makeFakeSpawn({
      stdout: agyResult(JSON.stringify({ title: 't', body: 'b' })),
    });
    const suggest = createSuggester({ cwd: '/r', spawn: fake.fn });

    await suggest({
      backlog: BACKLOG,
      personaPrompt: 'p',
      provider: 'agy-cli',
      model: 'default',
    });

    expect(fake.calls[0]!.args).not.toContain('--model');
  });

  it('forwards a concrete model slug', async () => {
    const fake = makeFakeSpawn({
      stdout: agyResult(JSON.stringify({ title: 't', body: 'b' })),
    });
    const suggest = createSuggester({ cwd: '/r', spawn: fake.fn });

    await suggest({
      backlog: BACKLOG,
      personaPrompt: 'p',
      provider: 'agy-cli',
      model: 'gemini-3.6-flash-low',
    });

    const ix = fake.calls[0]!.args.indexOf('--model');
    expect(ix).not.toBe(-1);
    expect(fake.calls[0]!.args[ix + 1]).toBe('gemini-3.6-flash-low');
  });

  it('recovers JSON wrapped in markdown fences', async () => {
    const fenced = '```json\n' + JSON.stringify({ title: 'Fenced', body: 'b' }) + '\n```';
    const fake = makeFakeSpawn({ stdout: opencodeStream(fenced) });
    const suggest = createSuggester({ cwd: '/r', spawn: fake.fn });

    const result = await suggest({
      backlog: BACKLOG,
      personaPrompt: 'p',
      provider: 'opencode-cli',
    });

    expect(result).toEqual({ title: 'Fenced', body: 'b' });
  });

  it('surfaces adapter error results with the CLI message', async () => {
    const stdout = [
      JSON.stringify({
        type: 'error',
        error: { name: 'AuthError', data: { message: 'Please run opencode auth login' } },
      }),
      '',
    ].join('\n');
    const fake = makeFakeSpawn({ stdout, exitCode: 1 });
    const suggest = createSuggester({ cwd: '/r', spawn: fake.fn });

    await expect(
      suggest({ backlog: BACKLOG, personaPrompt: 'p', provider: 'opencode-cli' }),
    ).rejects.toThrowError(/opencode error: Please run opencode auth login/);
  });

  it('throws ComposerError when the final text is not JSON', async () => {
    const fake = makeFakeSpawn({ stdout: opencodeStream('just some prose, no object') });
    const suggest = createSuggester({ cwd: '/r', spawn: fake.fn });

    await expect(
      suggest({ backlog: BACKLOG, personaPrompt: 'p', provider: 'opencode-cli' }),
    ).rejects.toThrowError(ComposerError);
  });

  it('forwards tool and thought events to onEvent', async () => {
    const stdout = [
      JSON.stringify({ type: 'step_start', sessionID: 'sess-2' }),
      JSON.stringify({
        type: 'tool_use',
        part: { type: 'tool', callID: 't1', tool: 'read', sessionID: 'sess-2', state: { input: { path: '/r/x.ts' } } },
      }),
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'thinking aloud', sessionID: 'sess-2' } }),
      JSON.stringify({
        type: 'step_finish',
        part: { type: 'finish', reason: 'stop', sessionID: 'sess-2', tokens: { input: 1, output: 1 } },
      }),
      '',
    ].join('\n');
    const fake = makeFakeSpawn({ stdout: opencodeStream(JSON.stringify({ title: 't', body: 'b' })) });
    const events: Array<{ kind: string }> = [];
    const suggest = createSuggester({ cwd: '/r', spawn: fake.fn });

    // use a stream that includes tool/text events but still ends in valid JSON
    const fakeWithTools = makeFakeSpawn({ stdout });
    const suggestWithTools = createSuggester({ cwd: '/r', spawn: fakeWithTools.fn });
    // this stream has no JSON in text — expect failure but events captured
    await suggestWithTools({
      backlog: BACKLOG,
      personaPrompt: 'p',
      provider: 'opencode-cli',
      onEvent: (ev) => events.push(ev),
    }).catch(() => undefined);

    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('tool');
    expect(kinds).toContain('thought');
    void suggest;
    void fake;
  });
});
