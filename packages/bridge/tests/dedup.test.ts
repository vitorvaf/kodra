import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventDedup } from '../src/dedup';

describe('EventDedup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('seen returns false then true after remember', () => {
    const d = new EventDedup();
    expect(d.seen('a')).toBe(false);
    d.remember('a');
    expect(d.seen('a')).toBe(true);
  });

  it('expired keys return false after TTL elapses', () => {
    const d = new EventDedup({ ttlMs: 1000 });
    d.remember('a');
    expect(d.seen('a')).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(d.seen('a')).toBe(false);
  });

  it('over-cap evicts oldest by remember-order', () => {
    const d = new EventDedup({ maxKeys: 2 });
    d.remember('a');
    d.remember('b');
    d.remember('c');
    expect(d.seen('a')).toBe(false);
    expect(d.seen('b')).toBe(true);
    expect(d.seen('c')).toBe(true);
  });
});
