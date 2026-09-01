import { existsSync } from 'node:fs';
import { safeStorage } from 'electron';
import { CREDENTIALS_PATH as CLAUDE_CREDENTIALS_PATH } from './claude-auth.js';

export function safeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function hasClaudeCodeCredentials(): boolean {
  return existsSync(CLAUDE_CREDENTIALS_PATH);
}
