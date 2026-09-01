import type { Db } from '../db.js';
import type {
  ProviderConfig,
  ProviderId,
  ProviderKeyEncryption,
  ProviderSettings,
} from '../types.js';

const PROVIDER_IDS: readonly ProviderId[] = [
  'claude-code',
  'codex-cli',
  'gemini-cli',
  'amp-cli',
  'cursor-cli',
  'copilot-cli',
  'opencode-cli',
  'droid-cli',
  'ccr-cli',
  'qwen-cli',
  'acp',
];

interface ProviderConfigRow {
  id: string;
  enabled: number;
  default_model: string | null;
  key_encrypted: Buffer | null;
  key_encryption: string;
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToConfig(row: ProviderConfigRow): ProviderConfig {
  return {
    id: row.id as ProviderId,
    enabled: row.enabled === 1,
    defaultModel: row.default_model,
    keyEncrypted: row.key_encrypted,
    keyEncryption: (row.key_encryption as ProviderKeyEncryption) ?? 'plain',
    lastValidatedAt: row.last_validated_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ProviderConfigPatch {
  enabled?: boolean;
  defaultModel?: string | null;
  keyEncrypted?: Buffer | null;
  keyEncryption?: ProviderKeyEncryption;
  lastValidatedAt?: string | null;
  lastError?: string | null;
}

const PATCH_COLUMNS: Record<keyof ProviderConfigPatch, string> = {
  enabled: 'enabled',
  defaultModel: 'default_model',
  keyEncrypted: 'key_encrypted',
  keyEncryption: 'key_encryption',
  lastValidatedAt: 'last_validated_at',
  lastError: 'last_error',
};

export class ProvidersRepo {
  constructor(private readonly db: Db) {}

  list(): ProviderConfig[] {
    const rows = this.db
      .prepare('SELECT * FROM provider_config ORDER BY id')
      .all() as ProviderConfigRow[];
    return rows.map(rowToConfig);
  }

  get(id: ProviderId): ProviderConfig {
    const row = this.db.prepare('SELECT * FROM provider_config WHERE id = ?').get(id) as
      | ProviderConfigRow
      | undefined;
    if (!row) throw new Error(`provider_config row missing for id: ${id}`);
    return rowToConfig(row);
  }

  update(id: ProviderId, patch: ProviderConfigPatch): ProviderConfig {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as (keyof ProviderConfigPatch)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      fields.push(`${PATCH_COLUMNS[key]} = ?`);
      if (key === 'enabled') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value);
      }
    }
    fields.push("updated_at = datetime('now')");
    values.push(id);
    this.db
      .prepare(`UPDATE provider_config SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
    return this.get(id);
  }

  /**
   * Returns true if any provider has both `enabled` and stored credentials
   * (key for API providers — claude-code is checked separately by the
   * desktop layer because its credentials are file-based).
   */
  hasAnyApiKeyConfigured(): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM provider_config
         WHERE enabled = 1
           AND key_encrypted IS NOT NULL
           AND id <> 'claude-code'
         LIMIT 1`,
      )
      .get();
    return !!row;
  }

  isClaudeCodeEnabled(): boolean {
    const row = this.db
      .prepare("SELECT enabled FROM provider_config WHERE id = 'claude-code'")
      .get() as { enabled: number } | undefined;
    return row?.enabled === 1;
  }
}

export { PROVIDER_IDS };

interface ProviderSettingsRow {
  id: number;
  default_provider: string | null;
  default_model: string | null;
  env_migration_done: number;
}

function rowToSettings(row: ProviderSettingsRow): ProviderSettings {
  return {
    defaultProvider: (row.default_provider as ProviderId | null) ?? null,
    defaultModel: row.default_model,
    envMigrationDone: row.env_migration_done === 1,
  };
}

export interface ProviderSettingsPatch {
  defaultProvider?: ProviderId | null;
  defaultModel?: string | null;
  envMigrationDone?: boolean;
}

export class ProviderSettingsRepo {
  constructor(private readonly db: Db) {}

  get(): ProviderSettings {
    const row = this.db.prepare('SELECT * FROM provider_settings WHERE id = 1').get() as
      | ProviderSettingsRow
      | undefined;
    if (!row) throw new Error('provider_settings row missing — migration may not have run');
    return rowToSettings(row);
  }

  update(patch: ProviderSettingsPatch): ProviderSettings {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.defaultProvider !== undefined) {
      fields.push('default_provider = ?');
      values.push(patch.defaultProvider);
    }
    if (patch.defaultModel !== undefined) {
      fields.push('default_model = ?');
      values.push(patch.defaultModel);
    }
    if (patch.envMigrationDone !== undefined) {
      fields.push('env_migration_done = ?');
      values.push(patch.envMigrationDone ? 1 : 0);
    }
    if (fields.length > 0) {
      this.db
        .prepare(`UPDATE provider_settings SET ${fields.join(', ')} WHERE id = 1`)
        .run(...values);
    }
    return this.get();
  }

  markEnvMigrationDone(): ProviderSettings {
    return this.update({ envMigrationDone: true });
  }
}
