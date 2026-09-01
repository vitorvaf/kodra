import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStoreInMemory, type Store, type AgentRun } from '@kanbots/local-store';
import { createCurator, type CuratorOutcome, type CuratorSpawnFn } from '../src/curator/index.js';

interface FakeChild extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  kill(signal?: NodeJS.Signals): boolean;
}

function makeFakeChild(): { child: FakeChild; stdoutPush: (s: string) => void; stdoutEnd: () => void } {
  const emitter = new EventEmitter() as FakeChild;
  const stdoutChunks: string[] = [];
  let stdoutResolve: ((value: string | null) => void) | null = null;

  const stdout = new Readable({
    read(): void {
      if (stdoutChunks.length > 0) {
        this.push(stdoutChunks.shift()!);
      } else if (stdoutResolve === null) {
        // wait for push
      }
    },
  });
  const stderr = new Readable({ read(): void { this.push(null); } });
  const stdinWrites: string[] = [];
  const stdin = new Writable({
    write(chunk, _enc, cb): void {
      stdinWrites.push(chunk.toString());
      cb();
    },
  });
  emitter.stdout = stdout;
  emitter.stderr = stderr;
  emitter.stdin = stdin;
  emitter.kill = (): boolean => {
    emitter.emit('close', 0);
    return true;
  };

  const stdoutPush = (s: string): void => {
    stdout.push(s);
  };
  const stdoutEnd = (): void => {
    stdout.push(null);
  };
  void stdoutResolve;
  return { child: emitter, stdoutPush, stdoutEnd };
}

function makeStore(): { store: Store; threadId: number; runId: number; runRow: AgentRun } {
  const store = openStoreInMemory();
  const thread = store.threads.create({ repoOwner: 'octo', repoName: 'cat', issueNumber: 1 });
  const run = store.agentRuns.create({ threadId: thread.id });
  store.agentRuns.update(run.id, { successSignal: 'completed_clean' });
  store.events.append({ agentRunId: run.id, type: 'text', payload: { text: 'starting work' } });
  store.events.append({
    agentRunId: run.id,
    type: 'tool_use',
    payload: { toolUseId: 't1', name: 'Read', input: { file_path: 'src/foo.ts' } },
  });
  store.events.append({
    agentRunId: run.id,
    type: 'tool_use',
    payload: { toolUseId: 't2', name: 'Edit', input: { file_path: 'src/foo.ts' } },
  });
  const updated = store.agentRuns.findById(run.id)!;
  return { store, threadId: thread.id, runId: run.id, runRow: updated };
}

describe('curator', () => {
  let store: Store;
  let runRow: AgentRun;
  let cleanup: () => void;

  beforeEach(() => {
    const setup = makeStore();
    store = setup.store;
    runRow = setup.runRow;
    cleanup = (): void => store.close();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('skips runs that did not complete cleanly', async () => {
    store.agentRuns.update(runRow.id, { successSignal: 'failed' });
    const failedRun = store.agentRuns.findById(runRow.id)!;
    const outcomes: CuratorOutcome[] = [];
    const spawn: CuratorSpawnFn = vi.fn();
    const curator = createCurator({
      store,
      cwd: '/tmp',
      spawn,
      onResult: (o) => outcomes.push(o),
    });
    await curator(failedRun);
    expect(spawn).not.toHaveBeenCalled();
    expect(outcomes).toEqual([{ kind: 'skipped', reason: 'no-events' }]);
  });

  it('parses claude JSON output and persists learnings', async () => {
    const { child, stdoutPush, stdoutEnd } = makeFakeChild();
    const spawn: CuratorSpawnFn = vi.fn(() => {
      const claudeOutput = JSON.stringify({
        type: 'result',
        is_error: false,
        result: 'ok',
        total_cost_usd: 0.0023,
        structured_output: {
          learnings: [
            {
              tag: 'convention',
              content: 'Tests live next to source files',
              confidence: 0.7,
            },
            {
              tag: 'gotcha',
              content: 'Migrations skip 0019 — see migrations/index.ts',
              confidence: 0.9,
            },
          ],
        },
      });
      // schedule push after spawn returns so the curator's stdout listener
      // is wired before the data lands.
      setImmediate(() => {
        stdoutPush(claudeOutput);
        stdoutEnd();
        child.emit('close', 0);
      });
      return child as unknown as ReturnType<CuratorSpawnFn>;
    });

    const outcomes: CuratorOutcome[] = [];
    const curator = createCurator({
      store,
      cwd: '/tmp',
      spawn,
      onResult: (o) => outcomes.push(o),
    });
    await curator(runRow);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ kind: 'completed', appliedCount: 2 });

    const learnings = store.learnings.listAll({
      repoOwner: 'octo',
      repoName: 'cat',
    });
    expect(learnings).toHaveLength(2);
    expect(learnings.map((l) => l.tag).sort()).toEqual(['convention', 'gotcha']);
    expect(learnings.find((l) => l.tag === 'gotcha')?.confidence).toBeCloseTo(0.9);

    // Spend was attributed.
    const state = store.learnings.getCuratorState('octo', 'cat');
    expect(state?.spentTodayUsd).toBeCloseTo(0.0023);
  });

  it('skips when daily budget already exhausted', async () => {
    store.learnings.setCuratorDailyBudget('octo', 'cat', 0.01);
    store.learnings.attributeCuratorSpend('octo', 'cat', 0.02);
    const outcomes: CuratorOutcome[] = [];
    const spawn: CuratorSpawnFn = vi.fn();
    const curator = createCurator({
      store,
      cwd: '/tmp',
      spawn,
      onResult: (o) => outcomes.push(o),
    });
    await curator(runRow);
    expect(spawn).not.toHaveBeenCalled();
    expect(outcomes).toEqual([{ kind: 'skipped', reason: 'budget' }]);
  });

  it('rejects malformed claude output and reports failure', async () => {
    const { child, stdoutPush, stdoutEnd } = makeFakeChild();
    const spawn: CuratorSpawnFn = vi.fn(() => {
      setImmediate(() => {
        stdoutPush('not valid json');
        stdoutEnd();
        child.emit('close', 0);
      });
      return child as unknown as ReturnType<CuratorSpawnFn>;
    });
    const outcomes: CuratorOutcome[] = [];
    const curator = createCurator({
      store,
      cwd: '/tmp',
      spawn,
      onResult: (o) => outcomes.push(o),
    });
    await curator(runRow);
    expect(outcomes[0]?.kind).toBe('failed');
  });
});
