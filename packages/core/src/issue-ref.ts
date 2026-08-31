import type { IssueRef } from './types.js';

const CUSTOM_ISSUE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

export function isValidCustomIssueId(value: string): boolean {
  return (
    CUSTOM_ISSUE_ID.test(value) &&
    !value.includes('..') &&
    !value.includes('--') &&
    !value.endsWith('.lock') &&
    !value.endsWith('-') &&
    !value.endsWith('.') &&
    value !== 'HEAD'
  );
}

export function parseIssueRef(value: string): IssueRef {
  return /^\d+$/.test(value) ? Number(value) : value;
}

export function issueBranchSlug(ref: IssueRef): string {
  let slug = String(ref)
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '');

  if (slug.length === 0) slug = 'task';
  if (slug.endsWith('.lock')) slug += '-t';
  if (slug === 'HEAD') slug = 'issue-HEAD';
  return slug;
}
