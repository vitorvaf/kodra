import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStoreInMemory, type Store } from '../src/index.js';

describe('HttpCacheRepo', () => {
  let store: Store;

  beforeEach(() => {
    store = openStoreInMemory();
  });

  afterEach(() => {
    store.close();
  });

  it('returns null for missing key', () => {
    expect(store.httpCache.get('missing')).toBeNull();
  });

  it('round-trips an entry', () => {
    const set = store.httpCache.set({
      key: 'GET /repos/octo/hello/issues',
      etag: 'W/"abc"',
      lastModified: 'Wed, 21 Oct 2026 07:28:00 GMT',
      body: '[{"id": 1}]',
    });
    expect(set.etag).toBe('W/"abc"');
    expect(set.body).toBe('[{"id": 1}]');

    const got = store.httpCache.get('GET /repos/octo/hello/issues');
    expect(got).toEqual(set);
  });

  it('upserts on conflict', () => {
    store.httpCache.set({ key: 'k', etag: 'v1', body: 'old' });
    const updated = store.httpCache.set({ key: 'k', etag: 'v2', body: 'new' });
    expect(updated.etag).toBe('v2');
    expect(updated.body).toBe('new');

    const got = store.httpCache.get('k');
    expect(got?.etag).toBe('v2');
    expect(got?.body).toBe('new');
  });

  it('handles missing etag/lastModified', () => {
    const set = store.httpCache.set({ key: 'k', body: 'v' });
    expect(set.etag).toBeNull();
    expect(set.lastModified).toBeNull();
  });

  it('deletes', () => {
    store.httpCache.set({ key: 'k', body: 'v' });
    store.httpCache.delete('k');
    expect(store.httpCache.get('k')).toBeNull();
  });

  it('delete on missing key is a no-op', () => {
    expect(() => store.httpCache.delete('missing')).not.toThrow();
  });
});
