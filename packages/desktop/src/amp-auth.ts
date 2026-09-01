import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Sourcegraph Amp CLI auth state lives under `~/.config/amp/` after
 * `amp /login` succeeds. `AMP_API_KEY` in the ambient environment is the
 * supported alternate path.
 *
 * Full login orchestration is out of scope for this iteration — the
 * desktop reports auth status only. The user runs `amp /login` in their
 * own terminal; the next time the app polls, the new credentials file
 * flips the status to authed.
 */
export const AMP_CONFIG_DIR = join(homedir(), '.config', 'amp');
export const AMP_SETTINGS_PATH = join(AMP_CONFIG_DIR, 'settings.json');
export const AMP_AUTH_PATH = join(AMP_CONFIG_DIR, 'auth.json');

export async function isAmpAuthenticated(): Promise<boolean> {
  if (existsSync(AMP_SETTINGS_PATH)) return true;
  if (existsSync(AMP_AUTH_PATH)) return true;
  if (process.env.AMP_API_KEY) return true;
  return false;
}

export interface AmpLoginNotImplemented {
  ok: false;
  error: string;
}

export async function startAmpLogin(): Promise<AmpLoginNotImplemented> {
  // The desktop doesn't drive the amp OAuth handshake yet. We surface an
  // actionable message so the user reaches for the CLI command directly.
  return {
    ok: false,
    error:
      'Run `amp /login` in your terminal to authorize Amp, then reopen this dialog.',
  };
}

export function cancelAmpLogin(): void {
  // No-op until the in-app login flow is implemented.
}
