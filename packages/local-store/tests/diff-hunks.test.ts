import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSnapshotId } from '../src/repos/diff-hunks.js';
import { openStoreInMemory, type Store } from '../src/index.js';

describe('DiffHunksRepo', () => {
  let store: Store;
  let runId: number;

  beforeEach(() => {
    store = openStoreInMemory();
    const t = store.threads.create({ repoOwner: 'octo', repoName: 'cat', issueNumber: 1 });
    const r = store.agentRuns.create({ threadId: t.id });
    runId = r.id;
  });

  afterEach(() => {
    store.close();
  });

  it('appends a hunk and computes a stable snapshot id', () => {
    const hunk = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/foo.ts',
      mode: 'edit',
      beforeText: 'const x = 1;',
      afterText: 'const x = 2;',
    });
    expect(hunk.status).toBe('pending');
    expect(hunk.snapshotId).toBe(
      makeSnapshotId({
        agentRunId: runId,
        filePath: 'src/foo.ts',
        opIndex: 0,
        beforeText: 'const x = 1;',
        afterText: 'const x = 2;',
      }),
    );
  });

  it('idempotent on duplicate snapshot id (replay safety)', () => {
    const a = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/foo.ts',
      mode: 'edit',
      beforeText: 'old',
      afterText: 'new',
    });
    const b = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/foo.ts',
      mode: 'edit',
      beforeText: 'old',
      afterText: 'new',
    });
    expect(b.id).toBe(a.id);
    const all = store.diffHunks.listByRun(runId);
    expect(all).toHaveLength(1);
  });

  it('preserves null beforeText for write mode', () => {
    const hunk = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/new.ts',
      mode: 'write',
      beforeText: null,
      afterText: 'export const x = 1;\n',
    });
    expect(hunk.beforeText).toBeNull();
    expect(hunk.mode).toBe('write');
  });

  it('preserves opIndex for multiedit_op rows', () => {
    const a = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/multi.ts',
      mode: 'multiedit_op',
      opIndex: 0,
      beforeText: 'a',
      afterText: 'b',
    });
    const b = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/multi.ts',
      mode: 'multiedit_op',
      opIndex: 1,
      beforeText: 'c',
      afterText: 'd',
    });
    expect(a.opIndex).toBe(0);
    expect(b.opIndex).toBe(1);
    expect(a.snapshotId).not.toBe(b.snapshotId);
  });

  it('markApproved transitions only pending → approved', () => {
    const h = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/foo.ts',
      mode: 'edit',
      beforeText: 'a',
      afterText: 'b',
    });
    const approved = store.diffHunks.markApproved(h.id);
    expect(approved.status).toBe('approved');
    expect(approved.resolvedAt).not.toBeNull();
    // re-applying is a no-op (status guard).
    const again = store.diffHunks.markApproved(h.id);
    expect(again.status).toBe('approved');
  });

  it('markRejected stores reason and timestamp', () => {
    const h = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/foo.ts',
      mode: 'edit',
      beforeText: 'a',
      afterText: 'b',
    });
    const rejected = store.diffHunks.markRejected(h.id, 'wrong approach');
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectReason).toBe('wrong approach');
    expect(rejected.resolvedAt).not.toBeNull();
  });

  it('markSupersededBeforeId only flips older pending rows for the same file', () => {
    const a = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/foo.ts',
      mode: 'edit',
      beforeText: 'a',
      afterText: 'b',
    });
    const b = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/foo.ts',
      mode: 'edit',
      beforeText: 'b',
      afterText: 'c',
    });
    const c = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/other.ts',
      mode: 'edit',
      beforeText: 'x',
      afterText: 'y',
    });
    const flipped = store.diffHunks.markSupersededBeforeId(runId, 'src/foo.ts', b.id);
    expect(flipped).toBe(1); // a only
    expect(store.diffHunks.findById(a.id)?.status).toBe('superseded');
    expect(store.diffHunks.findById(b.id)?.status).toBe('pending');
    expect(store.diffHunks.findById(c.id)?.status).toBe('pending');
  });

  it('listByRun returns rows in id order', () => {
    const a = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/a.ts',
      mode: 'edit',
      beforeText: '1',
      afterText: '2',
    });
    const b = store.diffHunks.append({
      agentRunId: runId,
      filePath: 'src/b.ts',
      mode: 'edit',
      beforeText: '3',
      afterText: '4',
    });
    const list = store.diffHunks.listByRun(runId);
    expect(list.map((h) => h.id)).toEqual([a.id, b.id]);
  });
});
