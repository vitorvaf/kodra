import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Cursor Agent CLI auth state lives under `~/.cursor/` once
 * `cursor-agent login` succeeds. `CURSOR_API_KEY` in the ambient
 * environment is the supported alternate path.
 *
 * Full login orchestration (spawning a child that runs `cursor-agent login`
 * and opening the auth URL in the browser) is out of scope for this
 * iteration — the desktop reports auth status only. The user runs
 * `cursor-agent login` in their own terminal; the next time the app polls,
 * the credentials file flips the status to authed.
 */
export const CURSOR_CONFIG_DIR = join(homedir(), '.cursor');
export const CURSOR_AUTH_PATH = join(CURSOR_CONFIG_DIR, 'config.json');

export async function isCursorAuthenticated(): Promise<boolean> {
  if (existsSync(CURSOR_AUTH_PATH)) return true;
  if (existsSync(CURSOR_CONFIG_DIR)) return true;
  if (process.env.CURSOR_API_KEY) return true;
  return false;
}

export interface CursorLoginNotImplemented {
  ok: false;
  error: string;
}

export async function startCursorLogin(): Promise<CursorLoginNotImplemented> {
  return {
    ok: false,
    error:
      'Run `cursor-agent login` in your terminal to authorize Cursor Agent, then reopen this dialog.',
  };
}

export function cancelCursorLogin(): void {
  // No-op until the in-app login flow is implemented.
}
