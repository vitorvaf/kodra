import { describe, expect, it } from 'vitest';
import {
  buildMemoryContext,
  rankMemoryItems,
  type MemoryContextItem,
} from '../../src/memory/context-builder.js';

const items: MemoryContextItem[] = [
  { content: 'private low', scope: 'private', score: 0.2, createdAt: '2026-01-01T00:00:00Z' },
  { content: 'team old', scope: 'team', createdAt: '2025-01-01T00:00:00Z' },
  { content: 'private high', scope: 'private', score: 0.9, type: 'bug' },
  { content: 'team new', scope: 'team', createdAt: '2026-06-01T00:00:00Z' },
];

describe('rankMemoryItems', () => {
  it('puts team memory first, then score, then recency', () => {
    expect(rankMemoryItems(items).map((i) => i.content)).toEqual([
      'team new',
      'team old',
      'private high',
      'private low',
    ]);
  });
});

describe('buildMemoryContext', () => {
  it('returns null when there is nothing to show', () => {
    expect(buildMemoryContext([], { maxItems: 5, maxChars: 1000 })).toBeNull();
    expect(
      buildMemoryContext([{ content: '   ', scope: 'private' }], { maxItems: 5, maxChars: 1000 }),
    ).toBeNull();
  });

  it('formats scope and type tags and keeps the staleness warning', () => {
    const block = buildMemoryContext(items, { maxItems: 10, maxChars: 4000 })!;
    expect(block.split('\n')[0]).toContain('code wins');
    expect(block).toContain('- [team] team new');
    expect(block).toContain('- [private/bug] private high');
    expect(block).toContain('memory_team_share');
  });

  it('honours the item limit', () => {
    const block = buildMemoryContext(items, { maxItems: 2, maxChars: 4000, mcpHint: false })!;
    expect(block.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(2);
  });

  it('honours the character limit and per-item truncation', () => {
    const long = 'x'.repeat(2000);
    const block = buildMemoryContext(
      [
        { content: long, scope: 'team' },
        { content: 'second', scope: 'private' },
      ],
      { maxItems: 10, maxChars: 600, maxItemChars: 300, heading: 'H', mcpHint: false },
    )!;
    expect(block.length).toBeLessThanOrEqual(600);
    expect(block).toContain('…');
    expect(block).toContain('- [private] second');
  });

  it('drops duplicates', () => {
    const block = buildMemoryContext(
      [
        { content: 'same fact', scope: 'team' },
        { content: 'same   fact', scope: 'private' },
      ],
      { maxItems: 10, maxChars: 1000, mcpHint: false },
    )!;
    expect(block.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(1);
  });
});
