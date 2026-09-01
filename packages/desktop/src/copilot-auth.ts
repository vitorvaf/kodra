import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * GitHub Copilot CLI auth state lives under `~/.copilot/` once the user
 * has signed in (the CLI honors a host of GitHub auth paths). The
 * `~/.config/gh/hosts.yml` fallback covers users authed via `gh auth login`
 * who haven't yet exercised Copilot directly.
 *
 * Full login orchestration is out of scope for this iteration — the
 * desktop reports auth status only. The user runs the CLI's own auth flow
 * (or `gh auth login` if they're already on GitHub CLI); the next time
 * the app polls, the new credentials file flips the status to authed.
 */
export const COPILOT_CONFIG_DIR = join(homedir(), '.copilot');
export const COPILOT_AUTH_PATH = join(COPILOT_CONFIG_DIR, 'config.json');
export const COPILOT_GH_HOSTS_PATH = join(homedir(), '.config', 'gh', 'hosts.yml');

export async function isCopilotAuthenticated(): Promise<boolean> {
  if (existsSync(COPILOT_AUTH_PATH)) return true;
  if (existsSync(COPILOT_CONFIG_DIR)) return true;
  if (existsSync(COPILOT_GH_HOSTS_PATH)) return true;
  if (process.env.GITHUB_TOKEN) return true;
  return false;
}

export interface CopilotLoginNotImplemented {
  ok: false;
  error: string;
}

export async function startCopilotLogin(): Promise<CopilotLoginNotImplemented> {
  return {
    ok: false,
    error:
      'Run `gh auth login` (or the Copilot CLI sign-in) in your terminal to authorize GitHub Copilot, then reopen this dialog.',
  };
}

export function cancelCopilotLogin(): void {
  // No-op until the in-app login flow is implemented.
}
