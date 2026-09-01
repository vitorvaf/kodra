export interface SentryIssueSummary {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  errorType: string | null;
  errorValue: string | null;
  lastEventId: string | null;
  status: string;
  project: { slug: string };
}

export interface SentryStackFrame {
  filename: string | null;
  function: string | null;
  module: string | null;
  lineno: number | null;
  colno: number | null;
  inApp: boolean;
  contextLine: string | null;
}

export interface SentryExceptionValue {
  type: string | null;
  value: string | null;
  module: string | null;
  stacktrace: { frames: SentryStackFrame[] } | null;
}

export interface SentryBreadcrumb {
  timestamp: string | null;
  category: string | null;
  level: string | null;
  message: string | null;
  type: string | null;
}

export interface SentryEventDetail {
  eventId: string;
  dateCreated: string;
  platform: string | null;
  environment: string | null;
  release: string | null;
  exception: SentryExceptionValue[];
  breadcrumbs: SentryBreadcrumb[];
}

export interface SentryIssueDetail extends SentryIssueSummary {
  latestEvent: SentryEventDetail | null;
}

export interface SentryListResult {
  issues: SentryIssueSummary[];
  nextCursor: string | null;
}
