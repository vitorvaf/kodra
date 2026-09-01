import type { Db } from '../db.js';
import type { CacheEntry } from '../types.js';

interface CacheRow {
  key: string;
  etag: string | null;
  last_modified: string | null;
  body: string;
  updated_at: string;
}

function rowToEntry(row: CacheRow): CacheEntry {
  return {
    key: row.key,
    etag: row.etag,
    lastModified: row.last_modified,
    body: row.body,
    updatedAt: row.updated_at,
  };
}

export interface SetCacheInput {
  key: string;
  body: string;
  etag?: string | null;
  lastModified?: string | null;
}

export class HttpCacheRepo {
  constructor(private readonly db: Db) {}

  get(key: string): CacheEntry | null {
    const row = this.db.prepare('SELECT * FROM http_cache WHERE key = ?').get(key) as
      | CacheRow
      | undefined;
    return row ? rowToEntry(row) : null;
  }

  set(input: SetCacheInput): CacheEntry {
    const updatedAt = new Date().toISOString();
    const etag = input.etag ?? null;
    const lastModified = input.lastModified ?? null;

    this.db
      .prepare(
        `INSERT INTO http_cache (key, etag, last_modified, body, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           etag = excluded.etag,
           last_modified = excluded.last_modified,
           body = excluded.body,
           updated_at = excluded.updated_at`,
      )
      .run(input.key, etag, lastModified, input.body, updatedAt);

    return {
      key: input.key,
      etag,
      lastModified,
      body: input.body,
      updatedAt,
    };
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM http_cache WHERE key = ?').run(key);
  }
}
