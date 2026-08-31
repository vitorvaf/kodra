import { describe, expect, it } from 'vitest';
import {
  isValidCustomIssueId,
  issueBranchSlug,
  parseIssueRef,
} from '../src/issue-ref.js';

describe('issue refs', () => {
  describe('isValidCustomIssueId', () => {
    it.each(['FEAT-42', 'a', 'a.b_c-d', '42', 'a'.repeat(32)])('accepts %s', (value) => {
      expect(isValidCustomIssueId(value)).toBe(true);
    });

    it.each([
      '',
      'a'.repeat(33),
      '-x',
      '.x',
      'a..b',
      'a--b',
      'a-',
      'a.',
      'x.lock',
      'HEAD',
      'a b',
      'a/b',
      'é',
    ])(
      'rejects %s',
      (value) => {
        expect(isValidCustomIssueId(value)).toBe(false);
      },
    );
  });

  it('keeps slugs injective for representative valid ids', () => {
    const values = ['a', 'a-b', 'a-b-c', 'FEAT-42', 'a.b', 'a_b', '42', 'a-b.c-d', 'X'.repeat(32)];
    expect(new Set(values.map(issueBranchSlug)).size).toBe(values.length);
  });

  it('parses digit-only refs as numbers', () => {
    expect(parseIssueRef('42')).toBe(42);
    expect(parseIssueRef('FEAT-42')).toBe('FEAT-42');
    expect(parseIssueRef('007')).toBe(7);
  });

  it.each([
    ['FEAT-42', 'FEAT-42'],
    ['fe at/x', 'fe-at-x'],
    ['a..b', 'a.b'],
    ['-x-', 'x'],
    ['x.lock', 'x.lock-t'],
    ['HEAD', 'issue-HEAD'],
    ['///', 'task'],
    [42, '42'],
  ])('makes branch slug %s', (ref, expected) => {
    expect(issueBranchSlug(ref)).toBe(expected);
  });
});
