import { statusFromLabels } from '@kanbots/core';
import type { Issue, StatusKey } from '@kanbots/core';
import type { SuggestFeatureBacklogEntry, SuggestFeatureEntryStatus } from './bridge.js';

const OPEN_PER_STATUS_LIMIT = 25;
const CLOSED_LIMIT = 30;

const STATUS_KEY_TO_ENTRY_STATUS: Record<StatusKey, SuggestFeatureEntryStatus> = {
  backlog: 'backlog',
  todo: 'todo',
  inProgress: 'in-progress',
  review: 'in-review',
  done: 'done',
};

function entryStatusForOpenIssue(issue: Issue): SuggestFeatureEntryStatus {
  const key = statusFromLabels(issue.labels);
  return key === null ? 'unlabeled' : STATUS_KEY_TO_ENTRY_STATUS[key];
}

function toEntry(issue: Issue, status: SuggestFeatureEntryStatus): SuggestFeatureBacklogEntry {
  const entry: SuggestFeatureBacklogEntry = {
    title: issue.title,
    status,
    number: issue.number,
  };
  if (issue.body) entry.body = issue.body;
  return entry;
}

function recencyTimestamp(issue: Issue): number {
  return Date.parse(issue.updatedAt) || 0;
}

/**
 * Build the issue context handed to the suggester. Includes open issues across
 * every status (capped per status) plus the most recently closed issues, so the
 * suggester can dedupe against in-flight and shipped work — not just the backlog.
 */
export function collectSuggestionEntries(issues: Issue[]): SuggestFeatureBacklogEntry[] {
  const openByStatus = new Map<SuggestFeatureEntryStatus, Issue[]>();
  const closed: Issue[] = [];

  for (const issue of issues) {
    if (issue.isPullRequest) continue;
    if (issue.state === 'closed') {
      closed.push(issue);
      continue;
    }
    const status = entryStatusForOpenIssue(issue);
    const bucket = openByStatus.get(status) ?? [];
    bucket.push(issue);
    openByStatus.set(status, bucket);
  }

  const entries: SuggestFeatureBacklogEntry[] = [];
  for (const [status, bucket] of openByStatus) {
    bucket.sort((a, b) => recencyTimestamp(b) - recencyTimestamp(a));
    for (const issue of bucket.slice(0, OPEN_PER_STATUS_LIMIT)) {
      entries.push(toEntry(issue, status));
    }
  }

  closed.sort((a, b) => recencyTimestamp(b) - recencyTimestamp(a));
  for (const issue of closed.slice(0, CLOSED_LIMIT)) {
    entries.push(toEntry(issue, 'closed'));
  }

  return entries;
}
