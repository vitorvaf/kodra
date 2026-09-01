import type {
  SentryBreadcrumb,
  SentryEventDetail,
  SentryExceptionValue,
  SentryIssueDetail,
  SentryIssueSummary,
  SentryListResult,
  SentryStackFrame,
} from './sentry-types.js';

export class SentryAuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SentryAuthError';
    this.status = status;
  }
}

export class SentryRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SentryRequestError';
    this.status = status;
  }
}

export interface SentryClientOptions {
  token: string;
  orgSlug: string;
  projectSlug: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface ListIssuesOptions {
  query?: string;
  environment?: string | null;
  statsPeriod?: string;
  cursor?: string;
  limit?: number;
}

const DEFAULT_BASE_URL = 'https://sentry.io/api/0';

export class SentryClient {
  private readonly token: string;
  private readonly orgSlug: string;
  private readonly projectSlug: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: SentryClientOptions) {
    this.token = opts.token;
    this.orgSlug = opts.orgSlug;
    this.projectSlug = opts.projectSlug;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
  }

  async testConnection(): Promise<{ ok: true; project: { slug: string; name: string } }> {
    const res = await this.request('GET', `/projects/${this.orgSlug}/${this.projectSlug}/`);
    const json = (await res.json()) as { slug: string; name: string };
    return { ok: true, project: { slug: json.slug, name: json.name } };
  }

  async listIssues(opts: ListIssuesOptions = {}): Promise<SentryListResult> {
    const params = new URLSearchParams();
    if (opts.query) params.set('query', opts.query);
    if (opts.statsPeriod) params.set('statsPeriod', opts.statsPeriod);
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.environment) params.set('environment', opts.environment);

    const path = `/projects/${this.orgSlug}/${this.projectSlug}/issues/?${params.toString()}`;
    const res = await this.request('GET', path);
    const raw = (await res.json()) as RawSentryIssue[];
    const linkHeader = res.headers.get('link');
    const nextCursor = parseNextCursor(linkHeader);

    return {
      issues: raw.map(rawToSummary),
      nextCursor,
    };
  }

  async getIssueDetail(sentryIssueId: string): Promise<SentryIssueDetail> {
    const issueRes = await this.request('GET', `/issues/${sentryIssueId}/`);
    const issueRaw = (await issueRes.json()) as RawSentryIssue;
    const summary = rawToSummary(issueRaw);

    let latestEvent: SentryEventDetail | null = null;
    try {
      const eventRes = await this.request('GET', `/issues/${sentryIssueId}/events/latest/`);
      const eventRaw = (await eventRes.json()) as RawSentryEvent;
      latestEvent = rawToEventDetail(eventRaw);
    } catch (err) {
      if (err instanceof SentryRequestError && err.status === 404) {
        latestEvent = null;
      } else {
        throw err;
      }
    }

    return { ...summary, latestEvent };
  }

  private async request(method: string, path: string, retries = 1): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 429 && retries > 0) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '5');
      const waitMs = Math.min(Math.max(retryAfter, 1), 60) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      return this.request(method, path, retries - 1);
    }

    if (res.status === 401 || res.status === 403) {
      throw new SentryAuthError(res.status, `Sentry auth failed (${res.status})`);
    }

    if (!res.ok) {
      const text = await safeText(res);
      throw new SentryRequestError(res.status, `Sentry ${method} ${path} → ${res.status}: ${text}`);
    }

    return res;
  }
}

interface RawSentryIssue {
  id: string;
  shortId?: string;
  title: string;
  culprit?: string | null;
  level?: string | null;
  count?: string | number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  metadata?: { type?: string | null; value?: string | null };
  lastEventID?: string | null;
  status?: string;
  project?: { slug?: string };
}

interface RawSentryEvent {
  eventID: string;
  dateCreated: string;
  platform?: string | null;
  environment?: string | null;
  release?: string | null;
  entries?: Array<{ type: string; data: unknown }>;
}

function rawToSummary(raw: RawSentryIssue): SentryIssueSummary {
  return {
    id: raw.id,
    shortId: raw.shortId ?? raw.id,
    title: raw.title,
    culprit: raw.culprit ?? null,
    level: raw.level ?? null,
    count: typeof raw.count === 'string' ? Number.parseInt(raw.count, 10) || 0 : (raw.count ?? 0),
    firstSeen: raw.firstSeen,
    lastSeen: raw.lastSeen,
    permalink: raw.permalink,
    errorType: raw.metadata?.type ?? null,
    errorValue: raw.metadata?.value ?? null,
    lastEventId: raw.lastEventID ?? null,
    status: raw.status ?? 'unresolved',
    project: { slug: raw.project?.slug ?? '' },
  };
}

function rawToEventDetail(raw: RawSentryEvent): SentryEventDetail {
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  let exception: SentryExceptionValue[] = [];
  let breadcrumbs: SentryBreadcrumb[] = [];

  for (const entry of entries) {
    if (entry.type === 'exception') {
      const data = entry.data as { values?: RawExceptionValue[] };
      exception = (data.values ?? []).map(rawToExceptionValue);
    } else if (entry.type === 'breadcrumbs') {
      const data = entry.data as { values?: RawBreadcrumb[] };
      breadcrumbs = (data.values ?? []).map(rawToBreadcrumb);
    }
  }

  return {
    eventId: raw.eventID,
    dateCreated: raw.dateCreated,
    platform: raw.platform ?? null,
    environment: raw.environment ?? null,
    release: raw.release ?? null,
    exception,
    breadcrumbs,
  };
}

interface RawExceptionValue {
  type?: string | null;
  value?: string | null;
  module?: string | null;
  stacktrace?: { frames?: RawStackFrame[] } | null;
}

interface RawStackFrame {
  filename?: string | null;
  function?: string | null;
  module?: string | null;
  lineNo?: number | null;
  colNo?: number | null;
  inApp?: boolean;
  contextLine?: string | null;
}

interface RawBreadcrumb {
  timestamp?: string | null;
  category?: string | null;
  level?: string | null;
  message?: string | null;
  type?: string | null;
}

function rawToExceptionValue(raw: RawExceptionValue): SentryExceptionValue {
  const frames = raw.stacktrace?.frames ?? [];
  return {
    type: raw.type ?? null,
    value: raw.value ?? null,
    module: raw.module ?? null,
    stacktrace: frames.length > 0 ? { frames: frames.map(rawToStackFrame) } : null,
  };
}

function rawToStackFrame(raw: RawStackFrame): SentryStackFrame {
  return {
    filename: raw.filename ?? null,
    function: raw.function ?? null,
    module: raw.module ?? null,
    lineno: raw.lineNo ?? null,
    colno: raw.colNo ?? null,
    inApp: raw.inApp === true,
    contextLine: raw.contextLine ?? null,
  };
}

function rawToBreadcrumb(raw: RawBreadcrumb): SentryBreadcrumb {
  return {
    timestamp: raw.timestamp ?? null,
    category: raw.category ?? null,
    level: raw.level ?? null,
    message: raw.message ?? null,
    type: raw.type ?? null,
  };
}

function parseNextCursor(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const segments = linkHeader.split(',').map((s) => s.trim());
  for (const segment of segments) {
    const match = segment.match(/<([^>]+)>;\s*rel="next"(?:;\s*results="(true|false)")?/);
    if (!match) continue;
    const url = match[1];
    const results = match[2];
    if (!url) continue;
    if (results === 'false') return null;
    const cursorMatch = url.match(/[?&]cursor=([^&]+)/);
    if (cursorMatch && cursorMatch[1]) return decodeURIComponent(cursorMatch[1]);
  }
  return null;
}

async function safeText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 500);
  } catch {
    return '';
  }
}
