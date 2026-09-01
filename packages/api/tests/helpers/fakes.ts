import type {
  Comment,
  CreateIssueInput,
  Issue,
  IssueSource,
  UpdateIssuePatch,
} from '@kanbots/core';
import type {
  AgentEvent,
  AgentRunStatus,
  Card,
  Store,
} from '@kanbots/local-store';
import type { AgentSupervisor } from '../../src/agent-runs/supervisor.js';

interface ApiError extends Error {
  status: number;
}

function apiError(status: number, message: string): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  return err;
}

export class FakeIssueSource implements IssueSource {
  private readonly issuesByState = new Map<string, Issue[]>();
  private readonly issuesByNumber = new Map<number, Issue>();
  private readonly commentsByIssue = new Map<number, Comment[]>();
  private nextCommentId = 1;
  private nextIssueNumber = 1000;

  failNextUpdateWith: ApiError | null = null;
  failNextAddCommentWith: ApiError | null = null;
  failNextCreateIssueWith: ApiError | null = null;

  setIssues(state: 'open' | 'closed' | 'all', issues: Issue[]): void {
    this.issuesByState.set(state, issues);
    for (const issue of issues) {
      this.issuesByNumber.set(issue.number, issue);
    }
  }

  setIssue(issue: Issue): void {
    this.issuesByNumber.set(issue.number, issue);
  }

  setComments(n: number, comments: Comment[]): void {
    this.commentsByIssue.set(n, comments);
  }

  failUpdate(status: number, message = 'fake update failure'): void {
    this.failNextUpdateWith = apiError(status, message);
  }

  failAddComment(status: number, message = 'fake comment failure'): void {
    this.failNextAddCommentWith = apiError(status, message);
  }

  failCreateIssue(status: number, message = 'fake create failure'): void {
    this.failNextCreateIssueWith = apiError(status, message);
  }

  async listIssues(opts: { state?: 'open' | 'closed' | 'all' } = {}): Promise<Issue[]> {
    return this.issuesByState.get(opts.state ?? 'open') ?? [];
  }

  async getIssue(n: number): Promise<Issue> {
    const issue = this.issuesByNumber.get(n);
    if (!issue) throw apiError(404, `Issue #${n} not found`);
    return issue;
  }

  async listComments(n: number): Promise<Comment[]> {
    return this.commentsByIssue.get(n) ?? [];
  }

  async updateIssue(n: number, patch: UpdateIssuePatch): Promise<Issue> {
    if (this.failNextUpdateWith) {
      const err = this.failNextUpdateWith;
      this.failNextUpdateWith = null;
      throw err;
    }
    const existing = this.issuesByNumber.get(n);
    if (!existing) throw apiError(404, `Issue #${n} not found`);
    const updated: Issue = {
      ...existing,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.state !== undefined ? { state: patch.state } : {}),
      ...(patch.labels !== undefined ? { labels: patch.labels } : {}),
      ...(patch.assignees !== undefined ? { assignees: patch.assignees } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.issuesByNumber.set(n, updated);
    return updated;
  }

  async addComment(n: number, body: string): Promise<Comment> {
    if (this.failNextAddCommentWith) {
      const err = this.failNextAddCommentWith;
      this.failNextAddCommentWith = null;
      throw err;
    }
    const id = this.nextCommentId++;
    const now = new Date().toISOString();
    const comment: Comment = {
      id,
      body,
      user: { login: 'tester', avatarUrl: null },
      createdAt: now,
      updatedAt: now,
      htmlUrl: `https://github.com/octo/hello/issues/${n}#issuecomment-${id}`,
    };
    const arr = this.commentsByIssue.get(n) ?? [];
    arr.push(comment);
    this.commentsByIssue.set(n, arr);
    return comment;
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    if (this.failNextCreateIssueWith) {
      const err = this.failNextCreateIssueWith;
      this.failNextCreateIssueWith = null;
      throw err;
    }
    const number = this.nextIssueNumber++;
    const now = new Date().toISOString();
    const issue: Issue = {
      number,
      title: input.title,
      body: input.body ?? '',
      state: 'open',
      labels: [...(input.labels ?? [])],
      assignees: [...(input.assignees ?? [])],
      user: { login: 'tester', avatarUrl: null },
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      htmlUrl: `https://github.com/octo/hello/issues/${number}`,
      isPullRequest: false,
    };
    this.issuesByNumber.set(number, issue);
    const arr = this.issuesByState.get('open') ?? [];
    arr.unshift(issue);
    this.issuesByState.set('open', arr);
    return issue;
  }
}

export interface StubSupervisor extends AgentSupervisor {
  calls: Array<{ type: string; args: unknown }>;
  pushEvent(runId: number, event: AgentEvent): void;
  pushCard(runId: number, card: Card): void;
  finish(runId: number, status: AgentRunStatus): void;
}

export function makeStubSupervisor(store: Store): StubSupervisor {
  const calls: Array<{ type: string; args: unknown }> = [];
  interface Subscriber {
    onEvent: (e: AgentEvent) => void;
    onStatus: (s: AgentRunStatus) => void;
    onCard?: (c: Card) => void;
  }
  const subscribers = new Map<number, Subscriber[]>();
  const activeRunIds = new Set<number>();

  const supervisor: AgentSupervisor = {
    async start(input) {
      calls.push({ type: 'start', args: input });
      const run = store.agentRuns.create({
        threadId: input.threadId,
        status: 'starting',
      });
      const updated = store.agentRuns.update(run.id, { status: 'running' });
      activeRunIds.add(updated.id);
      return updated;
    },
    async resume(input) {
      calls.push({ type: 'resume', args: input });
      const run = store.agentRuns.update(input.runId, {
        status: 'running',
        endedAt: null,
      });
      activeRunIds.add(run.id);
      const subs = subscribers.get(run.id) ?? [];
      for (const s of subs) s.onStatus(run.status);
      return run;
    },
    async startChat(input) {
      calls.push({ type: 'start', args: input });
      const run = store.agentRuns.create({
        threadId: input.threadId,
        status: 'starting',
      });
      const updated = store.agentRuns.update(run.id, { status: 'running' });
      activeRunIds.add(updated.id);
      return updated;
    },
    async resumeChat(input) {
      calls.push({ type: 'resume', args: input });
      const run = store.agentRuns.update(input.runId, {
        status: 'running',
        endedAt: null,
      });
      activeRunIds.add(run.id);
      const subs = subscribers.get(run.id) ?? [];
      for (const s of subs) s.onStatus(run.status);
      return run;
    },
    async stop(runId) {
      calls.push({ type: 'stop', args: runId });
      const stopped = store.agentRuns.update(runId, {
        status: 'stopped',
        endedAt: new Date().toISOString(),
      });
      activeRunIds.delete(runId);
      const subs = subscribers.get(runId) ?? [];
      for (const s of subs) s.onStatus('stopped');
      return stopped;
    },
    getRun(runId) {
      return store.agentRuns.findById(runId);
    },
    listEvents(runId, sinceSeq) {
      return store.events.list(runId, sinceSeq !== undefined ? { afterSeq: sinceSeq } : {});
    },
    listCards(runId) {
      return store.cards.listByRun(runId);
    },
    isActive(runId) {
      return activeRunIds.has(runId);
    },
    subscribe(runId, onEvent, onStatus, onCard) {
      const arr = subscribers.get(runId) ?? [];
      const entry: Subscriber = { onEvent, onStatus };
      if (onCard) entry.onCard = onCard;
      arr.push(entry);
      subscribers.set(runId, arr);
      return () => {
        const next = (subscribers.get(runId) ?? []).filter((e) => e !== entry);
        subscribers.set(runId, next);
      };
    },
    getCooldown() {
      return {
        active: false,
        until: null,
        reason: null,
        consecutiveHits: 0,
        message: null,
      };
    },
    subscribeCooldown() {
      return () => {};
    },
    async waitForCooldown() {
      // no-op in tests
    },
  };

  return Object.assign(supervisor, {
    calls,
    pushEvent(runId: number, event: AgentEvent): void {
      const subs = subscribers.get(runId) ?? [];
      for (const s of subs) s.onEvent(event);
    },
    pushCard(runId: number, card: Card): void {
      const subs = subscribers.get(runId) ?? [];
      for (const s of subs) s.onCard?.(card);
    },
    finish(runId: number, status: AgentRunStatus): void {
      activeRunIds.delete(runId);
      store.agentRuns.update(runId, {
        status,
        endedAt: new Date().toISOString(),
      });
      const subs = subscribers.get(runId) ?? [];
      for (const s of subs) s.onStatus(status);
    },
  });
}
