import type {
  AgentRunHandle,
  CreateWorktreeInput,
  RunSummary,
  StartAgentRunOptions,
  StreamEvent,
  Worktree,
} from '@kanbots/dispatcher';
import { openStoreInMemory, type MemoryConfig, type Store } from '@kanbots/local-store';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupervisor, type CreateSupervisorOptions } from '../src/agent-runs/supervisor.js';
import type { AgentMemoryClient, MemoryHit } from '../src/memory/client.js';
import { issueFixture } from './helpers/fixtures.js';
import { makeHandlerTestKit } from './helpers/make-handlers.js';

const enabledConfig: MemoryConfig = {
  enabled: true,
  provider: 'agentmemory',
  url: 'http://memory.test',
  secret: null,
  scope: 'shared',
  teamId: null,
};

interface TestHandle extends AgentRunHandle {
  emitEvent(event: StreamEvent): void;
  emitClose(exitCode?: number): void;
}

function makeHandle(pid: number): TestHandle {
  const emitter = new EventEmitter();
  let resolveDone: (summary: RunSummary) => void = () => undefined;
  const done = new Promise<RunSummary>((resolve) => {
    resolveDone = resolve;
  });
  const handle = {
    pid,
    done,
    on: (event: string, listener: (...args: unknown[]) => void): TestHandle => {
      emitter.on(event, listener);
      return handle as TestHandle;
    },
    off: (event: string, listener: (...args: unknown[]) => void): TestHandle => {
      emitter.off(event, listener);
      return handle as TestHandle;
    },
    stop: (): void => undefined,
    emitEvent: (event: StreamEvent): void => {
      emitter.emit('event', event);
    },
    emitClose: (exitCode = 0): void => {
      const summary: RunSummary = {
        exitCode,
        killedByStop: false,
        stopEscalation: null,
        stderr: '',
        result: null,
      };
      emitter.emit('close', summary);
      resolveDone(summary);
    },
  };
  return handle as TestHandle;
}

function makeMemoryClient(input: {
  hits?: MemoryHit[];
  session?: { hasContent: boolean } | null;
  searchError?: boolean;
  sessionError?: boolean;
} = {}): {
  memory: NonNullable<CreateSupervisorOptions['memory']>;
  saves: Array<Parameters<AgentMemoryClient['save']>[0]>;
} {
  const saves: Array<Parameters<AgentMemoryClient['save']>[0]> = [];
  const client: AgentMemoryClient = {
    health: async () => true,
    version: async () => 'test',
    smartSearch: async () => {
      if (input.searchError) throw new Error('search unavailable');
      return input.hits ?? [];
    },
    getSession: async () => {
      if (input.sessionError) throw new Error('session unavailable');
      return input.session ?? null;
    },
    save: async (saveInput) => {
      saves.push(saveInput);
      return true;
    },
  };
  return {
    memory: { client, getConfig: () => enabledConfig },
    saves,
  };
}

async function buildSupervisor(
  store: Store,
  memory?: CreateSupervisorOptions['memory'],
): Promise<{
  supervisor: Awaited<ReturnType<typeof createSupervisor>>;
  calls: StartAgentRunOptions[];
  handles: TestHandle[];
}> {
  const calls: StartAgentRunOptions[] = [];
  const handles: TestHandle[] = [];
  const supervisor = await createSupervisor({
    store,
    repoPath: '/tmp/repo',
    ...(memory ? { memory } : {}),
    prepareWorktreeDir: async () => undefined,
    createWorktree: async (input: CreateWorktreeInput): Promise<Worktree> => ({
      branch: input.branch,
      path: input.worktreePath,
      baseRef: null,
    }),
    stampWorktreeIdentity: async () => ({
      userName: 'Kodra Agent',
      userEmail: 'agent@kodra.local',
      hookInstalled: false,
      hookSkippedReason: null,
    }),
    startAgentRun: (options: StartAgentRunOptions): AgentRunHandle => {
      calls.push(options);
      const handle = makeHandle(1000 + handles.length);
      handles.push(handle);
      return handle;
    },
  });
  return { supervisor, calls, handles };
}

function makeThread(store: Store): number {
  return store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 }).id;
}

describe('agent memory flow', () => {
  const stores: Store[] = [];

  afterEach(() => {
    for (const store of stores.splice(0)) store.close();
  });

  it('recalls two memory hits into the card run system prompt', async () => {
    const store = openStoreInMemory();
    stores.push(store);
    const memory = makeMemoryClient({
      hits: [
        { content: 'Prefer the existing repository service boundary.', score: 0.9 },
        { content: 'Run focused API tests before the full suite.', score: 0.8 },
      ],
    });
    const { supervisor, calls } = await buildSupervisor(store, memory.memory);
    const run = await supervisor.start({
      threadId: makeThread(store),
      issueNumber: 7,
      prompt: 'Improve the API dispatch flow',
    });

    expect(run.status).toBe('running');
    expect(calls[0]?.appendSystemPrompt).toContain('RELEVANT_PROJECT_MEMORY');
    expect(calls[0]?.appendSystemPrompt).toContain('Prefer the existing repository service boundary.');
    expect(calls[0]?.appendSystemPrompt).toContain('Run focused API tests before the full suite.');
  });

  it.each([
    ['missing config', undefined, []],
    ['empty search', enabledConfig, []],
  ])('does not inject memory for %s', async (_label, config, hits) => {
    const store = openStoreInMemory();
    stores.push(store);
    const memory = makeMemoryClient({ hits });
    const configuredMemory = {
      ...memory.memory,
      getConfig: () => config,
    };
    const { supervisor, calls } = await buildSupervisor(store, configuredMemory);
    await supervisor.start({
      threadId: makeThread(store),
      issueNumber: 7,
      prompt: 'No recalled context',
    });

    expect(calls[0]?.appendSystemPrompt).not.toContain('RELEVANT_PROJECT_MEMORY');
  });

  it('continues dispatch when memory recall rejects', async () => {
    const store = openStoreInMemory();
    stores.push(store);
    const memory = makeMemoryClient({ searchError: true });
    const { supervisor, calls } = await buildSupervisor(store, memory.memory);

    const run = await supervisor.start({
      threadId: makeThread(store),
      issueNumber: 7,
      prompt: 'Dispatch despite unavailable memory',
    });

    expect(run.status).toBe('running');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.appendSystemPrompt).not.toContain('RELEVANT_PROJECT_MEMORY');
  });

  it('writes a fallback checkpoint when the completed session is empty', async () => {
    const store = openStoreInMemory();
    stores.push(store);
    const memory = makeMemoryClient({ session: { hasContent: false } });
    const { supervisor, handles } = await buildSupervisor(store, memory.memory);
    const run = await supervisor.start({
      threadId: makeThread(store),
      issueNumber: 7,
      prompt: 'Complete this task',
    });
    handles[0]!.emitEvent({ kind: 'session', sessionId: 'session-empty', model: null });
    handles[0]!.emitClose();
    await handles[0]!.done;
    await vi.waitFor(() => expect(memory.saves).toHaveLength(1));

    expect(memory.saves[0]).toMatchObject({
      kind: 'run-summary',
      metadata: { runId: run.id },
    });
  });

  it('does not write a checkpoint when the completed session has content', async () => {
    const store = openStoreInMemory();
    stores.push(store);
    const memory = makeMemoryClient({ session: { hasContent: true } });
    const { supervisor, handles } = await buildSupervisor(store, memory.memory);
    await supervisor.start({ threadId: makeThread(store), issueNumber: 7, prompt: 'Complete this task' });
    handles[0]!.emitEvent({ kind: 'session', sessionId: 'session-full', model: null });
    handles[0]!.emitClose();
    await handles[0]!.done;
    await Promise.resolve();
    expect(memory.saves).toHaveLength(0);
  });

  it('checkpoints a failed run with content as mid-work', async () => {
    const store = openStoreInMemory();
    stores.push(store);
    const memory = makeMemoryClient();
    const { supervisor, handles } = await buildSupervisor(store, memory.memory);
    const run = await supervisor.start({ threadId: makeThread(store), issueNumber: 7, prompt: 'Fail this task' });
    handles[0]!.emitEvent({ kind: 'text', text: 'Started implementing the requested change.' });
    handles[0]!.emitClose(1);
    await handles[0]!.done;
    await vi.waitFor(() => expect(memory.saves).toHaveLength(1));

    expect(memory.saves[0]).toMatchObject({
      kind: 'run-summary',
      content: expect.stringContaining(`Run #${run.id} (issue #7) failed mid-work`),
      metadata: { runId: run.id, interrupted: true },
    });
  });

  it('does not checkpoint a trivial interrupted run without content', async () => {
    const store = openStoreInMemory();
    stores.push(store);
    const memory = makeMemoryClient({ session: { hasContent: false } });
    const { supervisor, handles } = await buildSupervisor(store, memory.memory);
    await supervisor.start({ threadId: makeThread(store), issueNumber: 7, prompt: 'Fail this task' });
    handles[0]!.emitClose(1);
    await handles[0]!.done;
    await Promise.resolve();
    expect(memory.saves).toHaveLength(0);
  });

  it('does not throw or save when checkpoint session lookup rejects', async () => {
    const store = openStoreInMemory();
    stores.push(store);
    const memory = makeMemoryClient({ sessionError: true });
    const { supervisor, handles } = await buildSupervisor(store, memory.memory);
    await supervisor.start({ threadId: makeThread(store), issueNumber: 7, prompt: 'Complete this task' });
    handles[0]!.emitEvent({ kind: 'session', sessionId: 'session-unavailable', model: null });
    handles[0]!.emitClose();
    await handles[0]!.done;
    await Promise.resolve();
    expect(memory.saves).toHaveLength(0);
  });

  it('captures a resolved decision without blocking resume', async () => {
    const memory = makeMemoryClient();
    const kit = makeHandlerTestKit({}, { memory: memory.memory });
    kit.source.setIssue(issueFixture(7, 'decision task'));
    const thread = kit.store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 });
    const run = kit.store.agentRuns.create({ threadId: thread.id });
    kit.store.agentRuns.update(run.id, { status: 'awaiting_input' });
    const message = kit.store.messages.create({
      threadId: thread.id,
      role: 'agent',
      body: 'pick one',
      agentRunId: run.id,
    });
    const card = kit.store.cards.create({
      messageId: message.id,
      type: 'decision',
      payload: { question: 'Which path?', options: [{ value: 'a', label: 'Path A' }] },
    });

    const result = await kit.handlers['cards:resolve']({ cardId: card.id, value: 'a' });
    await vi.waitFor(() => expect(memory.saves).toHaveLength(1));

    expect(result.card.status).toBe('resolved');
    expect(memory.saves[0]).toMatchObject({ kind: 'decision' });
    expect(memory.saves[0]?.content).toContain('Path A');
  });

  it('skips decision capture when memory is disabled', async () => {
    const memory = makeMemoryClient();
    const kit = makeHandlerTestKit(
      {},
      { memory: { ...memory.memory, getConfig: () => ({ ...enabledConfig, enabled: false }) } },
    );
    kit.source.setIssue(issueFixture(7, 'decision task'));
    const thread = kit.store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 });
    const run = kit.store.agentRuns.create({ threadId: thread.id });
    kit.store.agentRuns.update(run.id, { status: 'awaiting_input' });
    const message = kit.store.messages.create({ threadId: thread.id, role: 'agent', body: 'pick', agentRunId: run.id });
    const card = kit.store.cards.create({
      messageId: message.id,
      type: 'decision',
      payload: { question: 'Which path?', options: [{ value: 'a', label: 'Path A' }] },
    });

    await kit.handlers['cards:resolve']({ cardId: card.id, value: 'a' });
    await Promise.resolve();
    expect(memory.saves).toHaveLength(0);
  });
});
