import type { Db } from '../db.js';
import type { SentryImport, SentryImportStatus, SentrySuggestion } from '../types.js';

interface SentryImportRow {
  sentry_issue_id: string;
  local_issue_number: number;
  status: string;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_event_id: string | null;
  permalink: string | null;
  culprit: string | null;
  error_type: string | null;
  error_value: string | null;
  analyzed_at: string | null;
  suggestion_json: string | null;
}

function parseSuggestion(json: string | null): SentrySuggestion | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as SentrySuggestion;
  } catch {
    return null;
  }
}

function rowToImport(row: SentryImportRow): SentryImport {
  return {
    sentryIssueId: row.sentry_issue_id,
    localIssueNumber: row.local_issue_number,
    status: row.status as SentryImportStatus,
    count: row.count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastEventId: row.last_event_id,
    permalink: row.permalink,
    culprit: row.culprit,
    errorType: row.error_type,
    errorValue: row.error_value,
    analyzedAt: row.analyzed_at,
    suggestion: parseSuggestion(row.suggestion_json),
  };
}

export interface UpsertSentryImportInput {
  sentryIssueId: string;
  localIssueNumber: number;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastEventId?: string | null;
  permalink?: string | null;
  culprit?: string | null;
  errorType?: string | null;
  errorValue?: string | null;
}

export class SentryImportsRepo {
  constructor(private readonly db: Db) {}

  findBySentryId(sentryIssueId: string): SentryImport | null {
    const row = this.db
      .prepare('SELECT * FROM sentry_imports WHERE sentry_issue_id = ?')
      .get(sentryIssueId) as SentryImportRow | undefined;
    return row ? rowToImport(row) : null;
  }

  findByLocalNumber(localIssueNumber: number): SentryImport | null {
    const row = this.db
      .prepare('SELECT * FROM sentry_imports WHERE local_issue_number = ?')
      .get(localIssueNumber) as SentryImportRow | undefined;
    return row ? rowToImport(row) : null;
  }

  mapByLocalNumber(): Map<number, SentryImport> {
    const rows = this.db.prepare('SELECT * FROM sentry_imports').all() as SentryImportRow[];
    const map = new Map<number, SentryImport>();
    for (const row of rows) {
      map.set(row.local_issue_number, rowToImport(row));
    }
    return map;
  }

  upsert(input: UpsertSentryImportInput): SentryImport {
    this.db
      .prepare(
        `INSERT INTO sentry_imports
           (sentry_issue_id, local_issue_number, count, first_seen_at, last_seen_at,
            last_event_id, permalink, culprit, error_type, error_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(sentry_issue_id) DO UPDATE SET
           count = excluded.count,
           last_seen_at = excluded.last_seen_at,
           last_event_id = excluded.last_event_id,
           permalink = excluded.permalink,
           culprit = excluded.culprit,
           error_type = excluded.error_type,
           error_value = excluded.error_value`,
      )
      .run(
        input.sentryIssueId,
        input.localIssueNumber,
        input.count,
        input.firstSeenAt,
        input.lastSeenAt,
        input.lastEventId ?? null,
        input.permalink ?? null,
        input.culprit ?? null,
        input.errorType ?? null,
        input.errorValue ?? null,
      );
    const result = this.findBySentryId(input.sentryIssueId);
    if (!result) throw new Error(`Failed to upsert sentry import ${input.sentryIssueId}`);
    return result;
  }

  setSuggestion(localIssueNumber: number, suggestion: SentrySuggestion): SentryImport {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE sentry_imports
         SET suggestion_json = ?, analyzed_at = ?, status = 'analyzed'
         WHERE local_issue_number = ?`,
      )
      .run(JSON.stringify(suggestion), now, localIssueNumber);
    const updated = this.findByLocalNumber(localIssueNumber);
    if (!updated) throw new Error(`sentry_import for local #${localIssueNumber} not found`);
    return updated;
  }

  markApplied(localIssueNumber: number): SentryImport {
    this.db
      .prepare(`UPDATE sentry_imports SET status = 'applied' WHERE local_issue_number = ?`)
      .run(localIssueNumber);
    const updated = this.findByLocalNumber(localIssueNumber);
    if (!updated) throw new Error(`sentry_import for local #${localIssueNumber} not found`);
    return updated;
  }
}
