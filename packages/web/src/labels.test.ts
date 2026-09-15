import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ageString,
  areaLabels,
  colorForLogin,
  linkedIssueNumbers,
  nonStatusLabels,
  priorityFromLabels,
  strippedBranch,
  tagFromLabels,
  withStatus,
} from './labels.js';

describe('withStatus', () => {
  it('replaces any existing status label with the new one', () => {
    expect(withStatus(['status:todo', 'bug'], 'done')).toEqual(['bug', 'status:done']);
  });

  it('strips the status label when moving to the inbox', () => {
    expect(withStatus(['status:review', 'area:ui'], null)).toEqual(['area:ui']);
  });

  it('maps inProgress to the kebab-case GitHub label', () => {
    expect(withStatus([], 'inProgress')).toEqual(['status:in-progress']);
  });
});

describe('priorityFromLabels', () => {
  it('reads the first priority label case-insensitively', () => {
    expect(priorityFromLabels(['area:x', 'priority:P1'])).toBe('p1');
  });

  it('ignores unknown priorities', () => {
    expect(priorityFromLabels(['priority:urgent'])).toBeNull();
    expect(priorityFromLabels([])).toBeNull();
  });
});

describe('tagFromLabels', () => {
  it('always tags pull requests as PR', () => {
    expect(tagFromLabels(['bug'], true)).toBe('PR');
  });

  it('maps bare and type-prefixed labels', () => {
    expect(tagFromLabels(['Enhancement'], false)).toBe('FEAT');
    expect(tagFromLabels(['type:docs'], false)).toBe('DOCS');
    expect(tagFromLabels(['type:impl'], false)).toBe('IMPL');
  });

  it('returns null when nothing matches', () => {
    expect(tagFromLabels(['area:ui', 'status:todo'], false)).toBeNull();
  });
});

describe('label filters', () => {
  it('areaLabels keeps only area: labels', () => {
    expect(areaLabels(['area:ui', 'bug', 'area:api'])).toEqual(['area:ui', 'area:api']);
  });

  it('nonStatusLabels drops status: labels', () => {
    expect(nonStatusLabels(['status:todo', 'bug'])).toEqual(['bug']);
  });
});

describe('linkedIssueNumbers', () => {
  it('collects numeric and custom ids across link prefixes, deduped and sorted', () => {
    const refs = linkedIssueNumbers([
      'parent:#12',
      'link:3',
      'Related:FEAT-42',
      'links:12',
      'parent:not valid!',
    ]);
    expect(refs.map(String)).toEqual(['3', '12', 'FEAT-42']);
  });

  it('returns an empty list with no link labels', () => {
    expect(linkedIssueNumbers(['bug'])).toEqual([]);
  });
});

describe('ageString', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats relative ages in the largest sensible unit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    expect(ageString('2026-09-14T11:59:30Z')).toBe('30s');
    expect(ageString('2026-09-14T11:15:00Z')).toBe('45m');
    expect(ageString('2026-09-14T03:00:00Z')).toBe('9h');
    expect(ageString('2026-09-10T12:00:00Z')).toBe('4d');
    expect(ageString('2026-06-14T12:00:00Z')).toBe('3mo');
  });

  it('never reports zero seconds and returns empty for invalid dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    expect(ageString('2026-09-14T12:00:00Z')).toBe('1s');
    expect(ageString('nope')).toBe('');
  });
});

describe('strippedBranch', () => {
  it('drops the legacy kb/ and kanbots/ prefixes', () => {
    expect(strippedBranch('kb/issue-1')).toBe('issue-1');
    expect(strippedBranch('kanbots/issue-2')).toBe('issue-2');
    expect(strippedBranch('kodra/issue-3')).toBe('kodra/issue-3');
  });

  it('returns an empty string for missing branches', () => {
    expect(strippedBranch(null)).toBe('');
    expect(strippedBranch(undefined)).toBe('');
  });
});

describe('colorForLogin', () => {
  it('is deterministic and stays inside the palette', () => {
    const a = colorForLogin('octocat');
    expect(a).toBe(colorForLogin('octocat'));
    expect(a).toMatch(/^oklch\(0\.74 0\.13 (45|75|130|200|240|280|320|350)\)$/);
  });
});
