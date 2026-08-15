import type {
  AgentRunHandle,
  CreateWorktreeInput,
  RunSummary,
  StartAgentRunOptions,
  StreamEvent,
  Worktree,
} from '@kanbots/dispatcher';
import { openStoreInMemory, type Store } from '@kanbots/local-store';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { createSupervisor } from '../src/agent-runs/supervisor.js';
import { startAgent } from '../src/handlers/agent-actions.js';
import type { HandlerDeps } from '../src/handlers/types.js';
import { makeHandlerTestKit } from './helpers/make-handlers.js';

interface TestHandle extends AgentRunHandle {
  emitEvent(event: StreamEvent): void;
  emitClose(): void;
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
    emitClose: (): void => {
      const summary: RunSummary = {
        exitCode: 0,
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

async function buildSupervisor(store: Store): Promise<{
  supervisor: Awaited<ReturnType<typeof createSupervisor>>;
  calls: StartAgentRunOptions[];
  handles: TestHandle[];
}> {
  const calls: StartAgentRunOptions[] = [];
  const handles: TestHandle[] = [];
  const supervisor = await createSupervisor({
    store,
    repoPath: '/tmp/repo',
    prepareWorktreeDir: async () => undefined,
    createWorktree: async (input: CreateWorktreeInput): Promise<Worktree> => ({
      branch: input.branch,
      path: input.worktreePath,
      baseRef: null,
    }),
    stampWorktreeIdentity: async () => ({
      userName: 'Kanbots Agent',
      userEmail: 'agent@kanbots.local',
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

describe('card dispatch tool wiring', () => {
  const stores: Store[] = [];

  afterEach(() => {
    for (const store of stores.splice(0)) store.close();
  });

  it('passes prepared extraArgs and env from issues:start-agent', async () => {
    const kit = makeHandlerTestKit();
    const prepared = {
      extraArgs: ['--mcp-config', '/tmp/card-mcp.json'],
      env: { KANBOTS_TOOL_TOKEN: 'card-token' },
      cleanup: () => undefined,
    };
    const providers: string[] = [];
    const thread = kit.store.threads.create({ repoOwner: 'a', repoName: 'b', issueNumber: 7 });
    const deps = {
      ...kit,
      providers: {
        safeStorageAvailable: () => false,
        hasClaudeCodeCredentials: () => true,
      },
      chatTools: {
        prepareForRun: async ({ provider }: { provider: string }) => {
          providers.push(provider);
          return prepared;
        },
      },
    } as unknown as HandlerDeps;

    await startAgent(deps, {
      number: 7,
      threadId: thread.id,
      prompt: 'dispatch this card',
    });

    const call = kit.supervisor.calls.find((entry) => entry.type === 'start');
    expect(call?.args).toMatchObject({
      extraArgs: prepared.extraArgs,
      env: prepared.env,
      cleanup: prepared.cleanup,
    });
    expect(providers).toEqual(['claude-code']);
  });

  it('keeps the no-chatTools path free of extra spawn options', async () => {
    const kit = makeHandlerTestKit();
    const thread = kit.store.threads.create({ repoOwner: 'a', repoName: 'b', issueNumber: 7 });
    await startAgent(
      {
        ...kit,
        providers: {
          safeStorageAvailable: () => false,
          hasClaudeCodeCredentials: () => true,
        },
      } as unknown as HandlerDeps,
      {
        number: 7,
        threadId: thread.id,
        prompt: 'dispatch without tools',
      },
    );

    const call = kit.supervisor.calls.find((entry) => entry.type === 'start');
    expect(call?.args).not.toHaveProperty('extraArgs');
    expect(call?.args).not.toHaveProperty('env');
    expect(call?.args).not.toHaveProperty('cleanup');
  });

  it('cleans up once on terminal close, but not on awaiting_input', async () => {
    const store = openStoreInMemory();
    stores.push(store);
    const threadId = store.threads.create({ repoOwner: 'a', repoName: 'b', issueNumber: 7 }).id;
    const { supervisor, calls, handles } = await buildSupervisor(store);
    let cleanupCount = 0;

    const run = await supervisor.start({
      threadId,
      issueNumber: 7,
      prompt: 'run with tools',
      extraArgs: ['--mcp-config', '/tmp/card-mcp.json'],
      env: { KANBOTS_TOOL_TOKEN: 'card-token' },
      cleanup: () => {
        cleanupCount += 1;
      },
    });
    expect(calls[0]).toMatchObject({
      extraArgs: ['--mcp-config', '/tmp/card-mcp.json'],
      env: { KANBOTS_TOOL_TOKEN: 'card-token' },
    });

    const first = handles[0]!;
    first.emitEvent({ kind: 'session', sessionId: 'session-1', model: null });
    first.emitEvent({
      kind: 'decision',
      question: 'Continue?',
      options: [{ value: 'yes', label: 'Yes' }],
    });
    first.emitClose();
    await first.done;
    expect(store.agentRuns.findById(run.id)?.status).toBe('awaiting_input');
    expect(cleanupCount).toBe(0);

    await supervisor.resume({ runId: run.id, prompt: 'yes' });
    const resumed = handles[1]!;
    resumed.emitClose();
    await resumed.done;
    expect(cleanupCount).toBe(1);

    // A duplicate close notification cannot revoke the bridge twice.
    resumed.emitClose();
    expect(cleanupCount).toBe(1);
  });
});
