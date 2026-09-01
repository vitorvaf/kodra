import type { Db } from '../db.js';
import type { SentryConfig, SentryTokenEncryption } from '../types.js';

interface SentryConfigRow {
  id: number;
  enabled: number;
  org_slug: string | null;
  project_slug: string | null;
  token_encrypted: Buffer | null;
  token_encryption: string;
  poll_interval_seconds: number;
  environment_filter: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  consecutive_auth_failures: number;
}

function rowToConfig(row: SentryConfigRow): SentryConfig {
  return {
    enabled: row.enabled === 1,
    orgSlug: row.org_slug,
    projectSlug: row.project_slug,
    tokenEncrypted: row.token_encrypted,
    tokenEncryption: (row.token_encryption as SentryTokenEncryption) ?? 'plain',
    pollIntervalSeconds: row.poll_interval_seconds,
    environmentFilter: row.environment_filter,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    consecutiveAuthFailures: row.consecutive_auth_failures,
  };
}

export interface SentryConfigPatch {
  enabled?: boolean;
  orgSlug?: string | null;
  projectSlug?: string | null;
  tokenEncrypted?: Buffer | null;
  tokenEncryption?: SentryTokenEncryption;
  pollIntervalSeconds?: number;
  environmentFilter?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  consecutiveAuthFailures?: number;
}

const PATCH_COLUMNS: Record<keyof SentryConfigPatch, string> = {
  enabled: 'enabled',
  orgSlug: 'org_slug',
  projectSlug: 'project_slug',
  tokenEncrypted: 'token_encrypted',
  tokenEncryption: 'token_encryption',
  pollIntervalSeconds: 'poll_interval_seconds',
  environmentFilter: 'environment_filter',
  lastSyncedAt: 'last_synced_at',
  lastError: 'last_error',
  consecutiveAuthFailures: 'consecutive_auth_failures',
};

export class SentryConfigRepo {
  constructor(private readonly db: Db) {}

  get(): SentryConfig {
    const row = this.db.prepare('SELECT * FROM sentry_config WHERE id = 1').get() as
      | SentryConfigRow
      | undefined;
    if (!row) {
      throw new Error('sentry_config row missing — migration may not have run');
    }
    return rowToConfig(row);
  }

  update(patch: SentryConfigPatch): SentryConfig {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as (keyof SentryConfigPatch)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      fields.push(`${PATCH_COLUMNS[key]} = ?`);
      if (key === 'enabled') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value);
      }
    }
    if (fields.length > 0) {
      this.db.prepare(`UPDATE sentry_config SET ${fields.join(', ')} WHERE id = 1`).run(...values);
    }
    return this.get();
  }

  recordAuthFailure(): SentryConfig {
    const current = this.get();
    return this.update({ consecutiveAuthFailures: current.consecutiveAuthFailures + 1 });
  }

  resetAuthFailures(): SentryConfig {
    return this.update({ consecutiveAuthFailures: 0, lastError: null });
  }
}
