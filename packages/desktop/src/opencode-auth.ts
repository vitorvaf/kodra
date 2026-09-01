import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * SST OpenCode CLI auth state lives under
 * `~/.local/share/opencode/auth.json` once the user has signed into one
 * of opencode's configured providers. Some provider keys can also be
 * supplied via env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) — we
 * treat the presence of either as a signal that opencode can run.
 *
 * Full login orchestration is out of scope for this iteration — the
 * desktop reports auth status only. The user runs `opencode auth` in
 * their own terminal; the next time the app polls, the auth file flips
 * the status to authed.
 */
export const OPENCODE_DATA_DIR = join(homedir(), '.local', 'share', 'opencode');
export const OPENCODE_AUTH_PATH = join(OPENCODE_DATA_DIR, 'auth.json');
export const OPENCODE_CONFIG_DIR = join(homedir(), '.config', 'opencode');

export async function isOpencodeAuthenticated(): Promise<boolean> {
  if (existsSync(OPENCODE_AUTH_PATH)) return true;
  if (existsSync(OPENCODE_CONFIG_DIR)) return true;
  // Any of the well-known provider keys signals opencode can route at
  // least one model.
  if (process.env.OPENCODE_AUTH_TOKEN) return true;
  if (process.env.ANTHROPIC_API_KEY) return true;
  if (process.env.OPENAI_API_KEY) return true;
  return false;
}

export interface OpencodeLoginNotImplemented {
  ok: false;
  error: string;
}

export async function startOpencodeLogin(): Promise<OpencodeLoginNotImplemented> {
  return {
    ok: false,
    error:
      'Run `opencode auth` in your terminal to authorize OpenCode, then reopen this dialog.',
  };
}

export function cancelOpencodeLogin(): void {
  // No-op until the in-app login flow is implemented.
}
