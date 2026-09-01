import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Qwen Code CLI auth state lives under `~/.qwen/` once the CLI has been
 * signed in. `DASHSCOPE_API_KEY` in the ambient environment is the
 * supported alternate path.
 *
 * Full login orchestration is out of scope for this iteration — the
 * desktop reports auth status only. The user runs `qwen-code login` in
 * their own terminal; the next time the app polls, the credentials file
 * flips the status to authed.
 */
export const QWEN_CONFIG_DIR = join(homedir(), '.qwen');
export const QWEN_SETTINGS_PATH = join(QWEN_CONFIG_DIR, 'settings.json');
export const QWEN_INSTALL_PATH = join(QWEN_CONFIG_DIR, 'installation_id');

export async function isQwenAuthenticated(): Promise<boolean> {
  if (existsSync(QWEN_SETTINGS_PATH)) return true;
  if (existsSync(QWEN_INSTALL_PATH)) return true;
  if (existsSync(QWEN_CONFIG_DIR)) return true;
  if (process.env.DASHSCOPE_API_KEY) return true;
  if (process.env.QWEN_API_KEY) return true;
  return false;
}

export interface QwenLoginNotImplemented {
  ok: false;
  error: string;
}

export async function startQwenLogin(): Promise<QwenLoginNotImplemented> {
  return {
    ok: false,
    error: 'Run `qwen-code login` in your terminal to authorize Qwen Code, then reopen this dialog.',
  };
}

export function cancelQwenLogin(): void {
  // No-op until the in-app login flow is implemented.
}
