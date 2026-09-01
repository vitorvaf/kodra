import { beforeEach, describe, expect, it } from 'vitest';
import { openStoreInMemory, type Store } from '../src/index.js';

describe('IssueRelationsRepo', () => {
  let store: Store;
  const wsId = 'ws-test';

  beforeEach(() => {
    store = openStoreInMemory();
    store.workspaces.ensure({ id: wsId, name: 'Test' });
  });

  describe('add + list', () => {
    it('records a relation and lists it from both directions', () => {
      const rel = store.issueRelations.add({
        workspaceId: wsId,
        parentNumber: 42,
        childNumber: 100,
      });
      expect(rel.id).toBeGreaterThan(0);
      expect(rel.parentNumber).toBe(42);
      expect(rel.childNumber).toBe(100);
      expect(rel.workspaceId).toBe(wsId);
      expect(rel.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const children = store.issueRelations.listChildren(wsId, 42);
      expect(children).toHaveLength(1);
      expect(children[0]!.childNumber).toBe(100);

      const parents = store.issueRelations.listParents(wsId, 100);
      expect(parents).toHaveLength(1);
      expect(parents[0]!.parentNumber).toBe(42);
    });

    it('supports multiple children for the same parent', () => {
      store.issueRelations.add({ workspaceId: wsId, parentNumber: 1, childNumber: 2 });
      store.issueRelations.add({ workspaceId: wsId, parentNumber: 1, childNumber: 3 });
      store.issueRelations.add({ workspaceId: wsId, parentNumber: 1, childNumber: 4 });
      const children = store.issueRelations.listChildren(wsId, 1);
      expect(children.map((r) => r.childNumber)).toEqual([2, 3, 4]);
    });

    it('scopes results by workspace', () => {
      store.workspaces.ensure({ id: 'other', name: 'Other' });
      store.issueRelations.add({ workspaceId: wsId, parentNumber: 1, childNumber: 2 });
      store.issueRelations.add({ workspaceId: 'other', parentNumber: 1, childNumber: 2 });
      expect(store.issueRelations.listChildren(wsId, 1)).toHaveLength(1);
      expect(store.issueRelations.listChildren('other', 1)).toHaveLength(1);
    });

    it('rejects self-loops at the SQL CHECK constraint', () => {
      expect(() =>
        store.issueRelations.add({
          workspaceId: wsId,
          parentNumber: 5,
          childNumber: 5,
        }),
      ).toThrow();
    });

    it('rejects duplicate (parent, child) tuples within a workspace', () => {
      store.issueRelations.add({ workspaceId: wsId, parentNumber: 1, childNumber: 2 });
      expect(() =>
        store.issueRelations.add({ workspaceId: wsId, parentNumber: 1, childNumber: 2 }),
      ).toThrow();
    });
  });

  describe('remove', () => {
    it('deletes the relation by id', () => {
      const rel = store.issueRelations.add({
        workspaceId: wsId,
        parentNumber: 1,
        childNumber: 2,
      });
      store.issueRelations.remove(rel.id);
      expect(store.issueRelations.listChildren(wsId, 1)).toHaveLength(0);
    });

    it('is a no-op for an unknown id', () => {
      expect(() => store.issueRelations.remove(9999)).not.toThrow();
    });
  });

  describe('findRoot + listAncestors', () => {
    it('returns null for a standalone issue', () => {
      expect(store.issueRelations.findRoot(wsId, 42)).toBeNull();
      expect(store.issueRelations.listAncestors(wsId, 42)).toEqual([]);
    });

    it('walks up a single level', () => {
      store.issueRelations.add({ workspaceId: wsId, parentNumber: 1, childNumber: 2 });
      expect(store.issueRelations.findRoot(wsId, 2)).toBe(1);
      expect(store.issueRelations.listAncestors(wsId, 2)).toEqual([1]);
    });

    it('walks multiple levels to the root', () => {
      // 1 → 2 → 3 → 4
      store.issueRelations.add({ workspaceId: wsId, parentNumber: 1, childNumber: 2 });
      store.issueRelations.add({ workspaceId: wsId, parentNumber: 2, childNumber: 3 });
      store.issueRelations.add({ workspaceId: wsId, parentNumber: 3, childNumber: 4 });
      expect(store.issueRelations.findRoot(wsId, 4)).toBe(1);
      expect(store.issueRelations.listAncestors(wsId, 4)).toEqual([3, 2, 1]);
    });

    it('caps walking at depth 16 for a long chain', () => {
      for (let i = 1; i <= 20; i++) {
        store.issueRelations.add({
          workspaceId: wsId,
          parentNumber: i,
          childNumber: i + 1,
        });
      }
      // listAncestors caps at MAX_ANCESTOR_DEPTH = 16 hops
      const ancestors = store.issueRelations.listAncestors(wsId, 21);
      expect(ancestors).toHaveLength(16);
    });

    it('handles corrupt cycles defensively in listAncestors', () => {
      // The SQL CHECK + handler-level guard prevents this in practice;
      // bypass via raw INSERT to make sure listAncestors doesn't spin.
      store.issueRelations.add({ workspaceId: wsId, parentNumber: 1, childNumber: 2 });
      store.db
        .prepare(
          `INSERT INTO issue_relations (workspace_id, parent_number, child_number, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(wsId, 2, 1, '2026-01-01');
      const ancestors = store.issueRelations.listAncestors(wsId, 2);
      // walks 2 → 1, then 1 → 2 is detected as a seen cycle and stops.
      expect(ancestors).toEqual([1]);
    });
  });
});
