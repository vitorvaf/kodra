import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Claude Code Router (CCR) auth state lives in
 * `~/.claude-code-router/config.json`, where the user configures which
 * upstream provider (OpenAI, Anthropic, …) CCR should route turns to.
 * Because CCR ultimately invokes `claude` under the hood, an authed
 * Claude Code session is also a valid signal.
 *
 * Full login orchestration is out of scope for this iteration — the
 * desktop reports auth status only. The user edits the CCR config file
 * directly; the next time the app polls, the file flips the status to
 * authed.
 */
export const CCR_CONFIG_DIR = join(homedir(), '.claude-code-router');
export const CCR_CONFIG_PATH = join(CCR_CONFIG_DIR, 'config.json');

export async function isCcrAuthenticated(): Promise<boolean> {
  if (existsSync(CCR_CONFIG_PATH)) return true;
  if (existsSync(CCR_CONFIG_DIR)) return true;
  // CCR is also functional when the user has an upstream-provider key in
  // their environment (CCR will forward to whichever provider is
  // configured in its router config).
  if (process.env.ANTHROPIC_API_KEY) return true;
  if (process.env.OPENAI_API_KEY) return true;
  return false;
}

export interface CcrLoginNotImplemented {
  ok: false;
  error: string;
}

export async function startCcrLogin(): Promise<CcrLoginNotImplemented> {
  return {
    ok: false,
    error:
      'Configure `~/.claude-code-router/config.json` with your provider key, then reopen this dialog.',
  };
}

export function cancelCcrLogin(): void {
  // No-op until the in-app login flow is implemented.
}
