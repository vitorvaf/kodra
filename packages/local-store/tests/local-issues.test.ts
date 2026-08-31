import { beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateIssueNumberError,
  InvalidIssueIdError,
  LocalIssueNotFoundError,
  openStoreInMemory,
  type Store,
} from '../src/index.js';

describe('LocalIssuesRepo', () => {
  let store: Store;

  beforeEach(() => {
    store = openStoreInMemory();
  });

  describe('create + list', () => {
    it('creates an issue with auto-incremented number starting at 1', () => {
      const issue = store.localIssues.create({
        title: 'first',
        authorLogin: 'leo',
      });
      expect(issue.number).toBe(1);
      expect(issue.title).toBe('first');
      expect(issue.state).toBe('open');
      expect(issue.labels).toEqual([]);
      expect(issue.assignees).toEqual([]);
      expect(issue.user.login).toBe('leo');
      expect(issue.htmlUrl).toBe('');
      expect(issue.isPullRequest).toBe(false);
    });

    it('increments numbers across creates', () => {
      const a = store.localIssues.create({ title: 'a', authorLogin: 'x' });
      const b = store.localIssues.create({ title: 'b', authorLogin: 'x' });
      const c = store.localIssues.create({ title: 'c', authorLogin: 'x' });
      expect([a.number, b.number, c.number]).toEqual([1, 2, 3]);
    });

    it('round-trips body, labels, assignees', () => {
      const issue = store.localIssues.create({
        title: 't',
        body: 'body text',
        labels: ['status:todo', 'agent:idle'],
        assignees: ['leo'],
        authorLogin: 'leo',
      });
      expect(issue.body).toBe('body text');
      expect(issue.labels).toEqual(['status:todo', 'agent:idle']);
      expect(issue.assignees).toEqual(['leo']);
    });

    it('round-trips custom and digit-only custom ids with canonical types', () => {
      const custom = store.localIssues.create({ title: 'custom', authorLogin: 'x', number: 'FEAT-42' });
      const numeric = store.localIssues.create({ title: 'numeric', authorLogin: 'x', number: '7' });
      expect(custom.number).toBe('FEAT-42');
      expect(typeof custom.number).toBe('string');
      expect(numeric.number).toBe(7);
      expect(typeof numeric.number).toBe('number');
      expect(store.localIssues.findByNumber('FEAT-42')?.number).toBe('FEAT-42');
    });

    it('rejects non-canonical and unsafe digit-only custom ids', () => {
      store.localIssues.create({ title: 'seven', authorLogin: 'x', number: '7' });
      expect(() => store.localIssues.create({ title: 'leading zero', authorLogin: 'x', number: '007' })).toThrow(
        InvalidIssueIdError,
      );
      expect(() =>
        store.localIssues.create({ title: 'unsafe', authorLogin: 'x', number: '9007199254740993' }),
      ).toThrow(InvalidIssueIdError);
    });

    it('rejects case-variant duplicate custom ids', () => {
      store.localIssues.create({ title: 'feature', authorLogin: 'x', number: 'FEAT-42' });
      expect(() => store.localIssues.create({ title: 'duplicate', authorLogin: 'x', number: 'feat-42' })).toThrow(
        DuplicateIssueNumberError,
      );
    });

    it.each(['', 'a'.repeat(33), '-bad', '.bad', 'a..b', 'x.lock', 'HEAD', 'a b', 'a/b', 'é'])(
      'rejects invalid custom id %s',
      (number) => {
        expect(() => store.localIssues.create({ title: 'bad', authorLogin: 'x', number })).toThrow(
          InvalidIssueIdError,
        );
      },
    );

    it('rejects duplicate numeric and alphanumeric ids', () => {
      store.localIssues.create({ title: 'numeric', authorLogin: 'x', number: '42' });
      store.localIssues.create({ title: 'custom', authorLogin: 'x', number: 'FEAT-42' });
      expect(() => store.localIssues.create({ title: 'dup', authorLogin: 'x', number: '42' })).toThrow(
        DuplicateIssueNumberError,
      );
      expect(() => store.localIssues.create({ title: 'dup', authorLogin: 'x', number: 'FEAT-42' })).toThrow(
        DuplicateIssueNumberError,
      );
    });

    it('auto-numbers above numeric ids and ignores alphanumeric ids', () => {
      store.localIssues.create({ title: 'five', authorLogin: 'x', number: '5' });
      store.localIssues.create({ title: 'three', authorLogin: 'x', number: '3' });
      store.localIssues.create({ title: 'feature', authorLogin: 'x', number: 'FEAT-9' });
      expect(store.localIssues.create({ title: 'next', authorLogin: 'x' }).number).toBe(6);
    });

    it('starts auto-numbering at one when all existing ids are custom', () => {
      store.localIssues.create({ title: 'feature', authorLogin: 'x', number: 'FEAT-9' });
      expect(store.localIssues.create({ title: 'first numeric', authorLogin: 'x' }).number).toBe(1);
    });

    it('orders numeric ids descending before alphanumeric ids descending', () => {
      for (const number of ['12', 'ZZ-1', '9', 'AB-2']) {
        store.localIssues.create({ title: number, authorLogin: 'x', number });
      }
      expect(store.localIssues.list().map((issue) => issue.number)).toEqual([12, 9, 'ZZ-1', 'AB-2']);
    });

    it('lists open issues by default, newest first', () => {
      store.localIssues.create({ title: 'a', authorLogin: 'x' });
      store.localIssues.create({ title: 'b', authorLogin: 'x' });
      const list = store.localIssues.list();
      expect(list).toHaveLength(2);
      expect(list[0]!.title).toBe('b');
      expect(list[1]!.title).toBe('a');
    });

    it('stores an optional folder association on create', () => {
      const workspace = store.workspaces.ensure({ id: 'default', name: 'Workspace' });
      const folder = store.folders.ensure({
        id: 'folder-a',
        workspaceId: workspace.id,
        name: 'A',
        path: '/tmp/a',
      });
      const issue = store.localIssues.create({
        title: 'a',
        authorLogin: 'x',
        folderId: folder.id,
      });

      expect(store.db.prepare('SELECT folder_id FROM local_issues WHERE number = ?').get(String(issue.number))).toEqual({
        folder_id: folder.id,
      });
    });

    it('filters by state', () => {
      const a = store.localIssues.create({ title: 'a', authorLogin: 'x' });
      const b = store.localIssues.create({ title: 'b', authorLogin: 'x' });
      store.localIssues.update(a.number, { state: 'closed' });

      expect(store.localIssues.list({ state: 'open' })).toHaveLength(1);
      expect(store.localIssues.list({ state: 'open' })[0]!.number).toBe(b.number);
      expect(store.localIssues.list({ state: 'closed' })).toHaveLength(1);
      expect(store.localIssues.list({ state: 'all' })).toHaveLength(2);
    });

    it('filters by folderId while leaving unscoped lists unchanged', () => {
      const workspace = store.workspaces.ensure({ id: 'default', name: 'Workspace' });
      const first = store.folders.ensure({
        id: 'folder-a',
        workspaceId: workspace.id,
        name: 'A',
        path: '/tmp/a',
      });
      const second = store.folders.ensure({
        id: 'folder-b',
        workspaceId: workspace.id,
        name: 'B',
        path: '/tmp/b',
      });
      const a = store.localIssues.create({ title: 'a', authorLogin: 'x' });
      const b = store.localIssues.create({ title: 'b', authorLogin: 'x' });
      store.db.prepare('UPDATE local_issues SET folder_id = ? WHERE number = ?').run(first.id, String(a.number));
      store.db.prepare('UPDATE local_issues SET folder_id = ? WHERE number = ?').run(second.id, String(b.number));

      expect(store.localIssues.list({ folderId: first.id }).map((i) => i.title)).toEqual(['a']);
      expect(store.localIssues.list({ folderId: second.id }).map((i) => i.title)).toEqual(['b']);
      expect(store.localIssues.list().map((i) => i.title)).toEqual(['b', 'a']);
    });
  });

  describe('findByNumber + update', () => {
    it('finds an existing issue', () => {
      const created = store.localIssues.create({ title: 't', authorLogin: 'x' });
      const found = store.localIssues.findByNumber(created.number);
      expect(found).not.toBeNull();
      expect(found?.title).toBe('t');
    });

    it('returns null for missing issue', () => {
      expect(store.localIssues.findByNumber(999)).toBeNull();
    });

    it('updates title/body/labels/assignees', () => {
      const created = store.localIssues.create({ title: 'old', authorLogin: 'x' });
      const updated = store.localIssues.update(created.number, {
        title: 'new',
        body: 'fresh body',
        labels: ['status:todo'],
        assignees: ['leo'],
      });
      expect(updated.title).toBe('new');
      expect(updated.body).toBe('fresh body');
      expect(updated.labels).toEqual(['status:todo']);
      expect(updated.assignees).toEqual(['leo']);
    });

    it('sets closed_at when state is set to closed', () => {
      const created = store.localIssues.create({ title: 't', authorLogin: 'x' });
      const closed = store.localIssues.update(created.number, { state: 'closed' });
      expect(closed.state).toBe('closed');
      expect(closed.closedAt).not.toBeNull();
    });

    it('clears closed_at when reopened', () => {
      const created = store.localIssues.create({ title: 't', authorLogin: 'x' });
      store.localIssues.update(created.number, { state: 'closed' });
      const reopened = store.localIssues.update(created.number, { state: 'open' });
      expect(reopened.closedAt).toBeNull();
    });

    it('throws LocalIssueNotFoundError for unknown issue', () => {
      expect(() => store.localIssues.update(999, { title: 'x' })).toThrow(LocalIssueNotFoundError);
    });

    it('bumps updated_at on update', async () => {
      const created = store.localIssues.create({ title: 't', authorLogin: 'x' });
      await new Promise((r) => setTimeout(r, 5));
      const updated = store.localIssues.update(created.number, { title: 'changed' });
      expect(updated.updatedAt > created.updatedAt).toBe(true);
    });
  });

  describe('comments', () => {
    it('adds and lists comments in insertion order', () => {
      const issue = store.localIssues.create({ title: 't', authorLogin: 'x' });
      const c1 = store.localIssues.addComment({
        issueNumber: issue.number,
        body: 'first',
        authorLogin: 'leo',
      });
      const c2 = store.localIssues.addComment({
        issueNumber: issue.number,
        body: 'second',
        authorLogin: 'leo',
      });
      const list = store.localIssues.listComments(issue.number);
      expect(list.map((c) => c.body)).toEqual(['first', 'second']);
      expect(list[0]!.id).toBe(c1.id);
      expect(list[1]!.id).toBe(c2.id);
    });

    it('throws when adding a comment to a missing issue', () => {
      expect(() =>
        store.localIssues.addComment({
          issueNumber: 999,
          body: 'x',
          authorLogin: 'leo',
        }),
      ).toThrow(LocalIssueNotFoundError);
    });

    it('returns empty list for an issue without comments', () => {
      const issue = store.localIssues.create({ title: 't', authorLogin: 'x' });
      expect(store.localIssues.listComments(issue.number)).toEqual([]);
    });

    it('comments are deleted when their issue is deleted (cascade)', () => {
      const issue = store.localIssues.create({ title: 't', authorLogin: 'x' });
      store.localIssues.addComment({
        issueNumber: issue.number,
        body: 'c',
        authorLogin: 'leo',
      });
      store.db.prepare('DELETE FROM local_issues WHERE number = ?').run(String(issue.number));
      const remaining = store.db.prepare('SELECT COUNT(*) AS n FROM local_comments').get() as {
        n: number;
      };
      expect(remaining.n).toBe(0);
    });

    it('adds and lists comments on an alphanumeric issue', () => {
      const issue = store.localIssues.create({ title: 'custom', authorLogin: 'x', number: 'FEAT-42' });
      store.localIssues.addComment({ issueNumber: issue.number, body: 'custom comment', authorLogin: 'leo' });
      expect(store.localIssues.listComments('FEAT-42').map((comment) => comment.body)).toEqual([
        'custom comment',
      ]);
    });

    it('bumps issue updated_at when a comment is added', async () => {
      const issue = store.localIssues.create({ title: 't', authorLogin: 'x' });
      await new Promise((r) => setTimeout(r, 5));
      store.localIssues.addComment({
        issueNumber: issue.number,
        body: 'c',
        authorLogin: 'leo',
      });
      const refreshed = store.localIssues.findByNumber(issue.number);
      expect(refreshed!.updatedAt > issue.updatedAt).toBe(true);
    });
  });
});
