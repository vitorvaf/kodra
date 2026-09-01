import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Factory Droid CLI auth state lives under `~/.factory/` once `droid`
 * has been signed in. The CLI uses the provider's own OAuth or API key,
 * stored locally in the config directory.
 *
 * Full login orchestration is out of scope for this iteration — the
 * desktop reports auth status only. The user runs `droid login` in
 * their own terminal; the next time the app polls, the credentials file
 * flips the status to authed.
 */
export const DROID_CONFIG_DIR = join(homedir(), '.factory');
export const DROID_AUTH_PATH = join(DROID_CONFIG_DIR, 'config.json');
export const DROID_MCP_PATH = join(DROID_CONFIG_DIR, 'mcp.json');

export async function isDroidAuthenticated(): Promise<boolean> {
  if (existsSync(DROID_AUTH_PATH)) return true;
  if (existsSync(DROID_MCP_PATH)) return true;
  if (existsSync(DROID_CONFIG_DIR)) return true;
  if (process.env.FACTORY_API_KEY) return true;
  return false;
}

export interface DroidLoginNotImplemented {
  ok: false;
  error: string;
}

export async function startDroidLogin(): Promise<DroidLoginNotImplemented> {
  return {
    ok: false,
    error: 'Run `droid login` in your terminal to authorize Factory Droid, then reopen this dialog.',
  };
}

export function cancelDroidLogin(): void {
  // No-op until the in-app login flow is implemented.
}
