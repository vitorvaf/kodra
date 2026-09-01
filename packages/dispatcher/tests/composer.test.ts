import { describe, expect, it } from 'vitest';
import { ComposerError, createComposer } from '../src/composer.js';
import { buildClaudeJsonOutput, makeFakeSpawn } from './helpers/fake-spawn.js';

describe('createComposer', () => {
  it('spawns claude with the expected flags and returns the drafted issue', async () => {
    const stdout = buildClaudeJsonOutput({ title: 'Add dark mode', body: '...' });
    const fake = makeFakeSpawn({ stdout });
    const draft = createComposer({ cwd: '/tmp/repo', spawn: fake.fn });

    const result = await draft({ description: 'I want a dark mode' });

    expect(result).toEqual({ title: 'Add dark mode', body: '...' });
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.command).toBe('claude');
    expect(call.cwd).toBe('/tmp/repo');
    expect(call.args).toContain('-p');
    expect(call.args).toContain('--output-format');
    expect(call.args).toContain('json');
    expect(call.args).toContain('--no-session-persistence');
    expect(call.args).toContain('--tools');
    expect(call.args).toContain('Read,Glob,Grep');
    expect(call.args).toContain('--json-schema');
    expect(call.args).toContain('--system-prompt');
    expect(call.stdin).toBe('I want a dark mode');
  });

  it('uses a custom command path when provided', async () => {
    const fake = makeFakeSpawn({
      stdout: buildClaudeJsonOutput({ title: 't', body: 'b' }),
    });
    const draft = createComposer({
      cwd: '/r',
      command: '/opt/claude/bin/claude',
      spawn: fake.fn,
    });

    await draft({ description: 'x' });
    expect(fake.calls[0]!.command).toBe('/opt/claude/bin/claude');
  });

  it('uses the system prompt override', async () => {
    const fake = makeFakeSpawn({
      stdout: buildClaudeJsonOutput({ title: 't', body: 'b' }),
    });
    const draft = createComposer({
      cwd: '/r',
      systemPrompt: 'CUSTOM PROMPT',
      spawn: fake.fn,
    });

    await draft({ description: 'x' });
    const args = fake.calls[0]!.args;
    const ix = args.indexOf('--system-prompt');
    expect(args[ix + 1]).toBe('CUSTOM PROMPT');
  });

  it('throws ComposerError when claude exits non-zero', async () => {
    const fake = makeFakeSpawn({
      stdout: '',
      stderr: 'something broke',
      exitCode: 1,
    });
    const draft = createComposer({ cwd: '/r', spawn: fake.fn });

    await expect(draft({ description: 'x' })).rejects.toThrowError(ComposerError);
    await expect(draft({ description: 'x' })).rejects.toMatchObject({
      stderr: 'something broke',
    });
  });

  it('throws when claude reports is_error=true', async () => {
    const fake = makeFakeSpawn({
      stdout: buildClaudeJsonOutput(null, { is_error: true, result: 'rate limit' }),
    });
    const draft = createComposer({ cwd: '/r', spawn: fake.fn });

    await expect(draft({ description: 'x' })).rejects.toThrowError(/rate limit/);
  });

  it('throws when output is not valid JSON', async () => {
    const fake = makeFakeSpawn({ stdout: 'not json at all' });
    const draft = createComposer({ cwd: '/r', spawn: fake.fn });

    await expect(draft({ description: 'x' })).rejects.toThrowError(/not valid JSON/);
  });

  it('throws when structured_output is missing required fields', async () => {
    const fake = makeFakeSpawn({
      stdout: buildClaudeJsonOutput({ title: 't', body: '' } as never),
    });
    const draft = createComposer({ cwd: '/r', spawn: fake.fn });
    // empty body still passes — we accept "" — but wrong shape should fail:

    const fake2 = makeFakeSpawn({
      stdout: JSON.stringify({
        type: 'result',
        is_error: false,
        structured_output: { title: 'only title' },
      }),
    });
    const draft2 = createComposer({ cwd: '/r', spawn: fake2.fn });
    await expect(draft({ description: 'x' })).resolves.toBeDefined();
    await expect(draft2({ description: 'x' })).rejects.toThrowError(/drafted issue/);
  });

  it('kills the child and throws on timeout', async () => {
    const fake = makeFakeSpawn({ hangs: true });
    const draft = createComposer({ cwd: '/r', timeoutMs: 50, spawn: fake.fn });

    await expect(draft({ description: 'x' })).rejects.toThrowError(/timed out/);
    expect(fake.killSignals).toContain('SIGTERM');
  });

  it('surfaces spawn errors (e.g. ENOENT for missing claude)', async () => {
    const fake = makeFakeSpawn({
      errorOnSpawn: Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }),
    });
    const draft = createComposer({ cwd: '/r', spawn: fake.fn });

    await expect(draft({ description: 'x' })).rejects.toThrowError(/ENOENT/);
  });

  it('forwards the user description as stdin', async () => {
    const fake = makeFakeSpawn({
      stdout: buildClaudeJsonOutput({ title: 't', body: 'b' }),
    });
    const draft = createComposer({ cwd: '/r', spawn: fake.fn });

    await draft({ description: 'first line\nsecond line' });
    expect(fake.calls[0]!.stdin).toBe('first line\nsecond line');
  });
});
