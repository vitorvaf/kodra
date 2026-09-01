import { safeStorage } from 'electron';
import type { SentryTokenEncryption } from '@kanbots/local-store';

export interface EncryptedToken {
  buffer: Buffer;
  encryption: SentryTokenEncryption;
}

const ENV_TOKEN_VAR = 'SENTRY_AUTH_TOKEN';

export function envTokenOverride(): string | null {
  const value = process.env[ENV_TOKEN_VAR];
  return value && value.length > 0 ? value : null;
}

export function encryptToken(plaintext: string): EncryptedToken {
  if (safeStorage.isEncryptionAvailable()) {
    return { buffer: safeStorage.encryptString(plaintext), encryption: 'safe' };
  }
  return { buffer: Buffer.from(plaintext, 'utf8'), encryption: 'plain' };
}

export function decryptToken(buffer: Buffer | null, encryption: SentryTokenEncryption): string | null {
  if (!buffer || buffer.length === 0) return null;
  if (encryption === 'safe') {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(buffer);
    } catch {
      return null;
    }
  }
  return buffer.toString('utf8');
}

export function resolveSentryToken(buffer: Buffer | null, encryption: SentryTokenEncryption): string | null {
  return envTokenOverride() ?? decryptToken(buffer, encryption);
}

export function safeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
