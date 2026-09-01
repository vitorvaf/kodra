import { describe, expect, it } from 'vitest';
import { ReplayBuffer } from '../replay-buffer.js';

function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}

describe('ReplayBuffer', () => {
  describe('push + getSince', () => {
    it('returns the slice after a known id', () => {
      const buf = new ReplayBuffer();
      buf.push('e1', { kind: 'a' });
      buf.push('e2', { kind: 'b' });
      buf.push('e3', { kind: 'c' });

      const slice = buf.getSince('e1');
      expect(slice.map((s) => s.id)).toEqual(['e2', 'e3']);
      expect(slice[1]).toEqual({ id: 'e3', payload: { kind: 'c' } });
    });

    it('returns all entries when lastEventId is null', () => {
      const buf = new ReplayBuffer();
      buf.push('e1', { kind: 'a' });
      buf.push('e2', { kind: 'b' });

      const slice = buf.getSince(null);
      expect(slice.map((s) => s.id)).toEqual(['e1', 'e2']);
    });

    it('returns empty slice when lastEventId is the most recent', () => {
      const buf = new ReplayBuffer();
      buf.push('e1', { kind: 'a' });
      buf.push('e2', { kind: 'b' });

      expect(buf.getSince('e2')).toEqual([]);
    });
  });

  describe('overflow eviction (byte cap)', () => {
    it('evicts oldest entries until under maxBytes', () => {
      const buf = new ReplayBuffer();
      buf.push('e1', 'aaaaaaaaaa');
      buf.push('e2', 'bbbbbbbbbb');
      buf.push('e3', 'cccccccccc');

      const startBytes = buf.bytes();
      expect(startBytes).toBeGreaterThan(0);

      const evicted = buf.evict(20, Number.POSITIVE_INFINITY);
      expect(evicted).toBeGreaterThanOrEqual(1);
      expect(buf.bytes()).toBeLessThanOrEqual(20);

      const remaining = buf.getSince(null).map((s) => s.id);
      expect(remaining).not.toContain('e1');
      expect(remaining[remaining.length - 1]).toBe('e3');
    });

    it('keeps everything when totalBytes is already under cap', () => {
      const buf = new ReplayBuffer();
      buf.push('e1', 'a');
      buf.push('e2', 'b');

      const before = buf.size();
      buf.evict(10_000, Number.POSITIVE_INFINITY);
      expect(buf.size()).toBe(before);
    });
  });

  describe('age-based eviction', () => {
    it('drops entries older than maxAgeMs', () => {
      const clock = fakeClock(0);
      const buf = new ReplayBuffer({ clock: clock.now });

      buf.push('e1', { v: 1 });
      clock.advance(500);
      buf.push('e2', { v: 2 });
      clock.advance(500);
      buf.push('e3', { v: 3 });

      clock.advance(1_500);

      const evicted = buf.evict(Number.POSITIVE_INFINITY, 1_500);
      expect(evicted).toBe(2);
      expect(buf.getSince(null).map((s) => s.id)).toEqual(['e3']);
    });

    it('preserves entries within the age window', () => {
      const clock = fakeClock(0);
      const buf = new ReplayBuffer({ clock: clock.now });

      buf.push('e1', { v: 1 });
      clock.advance(100);
      buf.push('e2', { v: 2 });

      buf.evict(Number.POSITIVE_INFINITY, 10_000);
      expect(buf.size()).toBe(2);
    });
  });

  describe('resume-from-id correctness', () => {
    it('returns all entries when lastEventId is unknown (caller signals reset)', () => {
      const buf = new ReplayBuffer();
      buf.push('e1', { v: 1 });
      buf.push('e2', { v: 2 });
      buf.push('e3', { v: 3 });

      const slice = buf.getSince('does-not-exist');
      expect(slice.map((s) => s.id)).toEqual(['e1', 'e2', 'e3']);
    });

    it('after eviction, an evicted id resolves to a full replay', () => {
      const buf = new ReplayBuffer();
      buf.push('e1', 'aaaaaaaaaa');
      buf.push('e2', 'bbbbbbbbbb');
      buf.push('e3', 'cccccccccc');

      buf.evict(15, Number.POSITIVE_INFINITY);
      const remaining = buf.getSince(null).map((s) => s.id);
      expect(remaining).not.toContain('e1');

      const slice = buf.getSince('e1');
      expect(slice.map((s) => s.id)).toEqual(remaining);
    });
  });
});
