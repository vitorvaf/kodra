import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Google Gemini CLI auth state lives in `~/.gemini/oauth_creds.json` after
 * `gemini /login` succeeds; `GEMINI_API_KEY` in the ambient environment is
 * the supported alternate path.
 *
 * Full login orchestration (spawning a child that runs `gemini /login` and
 * opening the auth URL in the browser) is out of scope for this iteration —
 * the desktop reports auth status only. The user runs `gemini /login` in
 * their own terminal; the next time the app polls, the new
 * `oauth_creds.json` flips the status to authed.
 */
export const GEMINI_AUTH_PATH = join(homedir(), '.gemini', 'oauth_creds.json');

export async function isGeminiAuthenticated(): Promise<boolean> {
  if (existsSync(GEMINI_AUTH_PATH)) return true;
  if (process.env.GEMINI_API_KEY) return true;
  return false;
}

export interface GeminiLoginNotImplemented {
  ok: false;
  error: string;
}

export async function startGeminiLogin(): Promise<GeminiLoginNotImplemented> {
  // The desktop doesn't drive the gemini OAuth handshake yet. We surface
  // an actionable message so the user reaches for the CLI command directly.
  return {
    ok: false,
    error:
      'Run `gemini /login` in your terminal to authorize Gemini CLI, then reopen this dialog.',
  };
}

export function cancelGeminiLogin(): void {
  // No-op until the in-app login flow is implemented.
}
