import { existsSync, readFileSync } from 'node:fs';
import type { AgentRunProvider } from '@kanbots/dispatcher';

/**
 * Credential detection + credential-aware provider fallback.
 *
 * Provider CLIs (codex, gemini, opencode, ...) find their own auth — the
 * `hasXxxCredentials` functions below mirror the well-known file/env
 * locations each CLI's own docs document. Claude Code is the exception: its
 * OAuth blob lives at a known path, but the desktop may surface it through a
 * Electron-safe check, so callers inject `hasClaudeCodeCreds`.
 *
 * `resolveProviderWithCreds` picks a provider that can actually run, so
 * removing a provider's credentials (e.g. signing out of Claude Code) stops
 * dispatch from silently funnelling every picker-less run into a provider
 * that will just fail at spawn.
 */

export const PROVIDER_FALLBACK_ORDER: readonly AgentRunProvider[] = [
  'claude-code',
  'opencode-cli',
  'codex-cli',
  'gemini-cli',
  'agy-cli',
  'amp-cli',
  'cursor-cli',
  'copilot-cli',
  'droid-cli',
  'ccr-cli',
  'qwen-cli',
  'acp',
];

function home(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? '';
}

export function hasCodexCliCredentials(): boolean {
  const h = home();
  if (h && existsSync(`${h}/.codex/auth.json`)) return true;
  if (process.env.OPENAI_API_KEY) return true;
  return false;
}

export function hasGeminiCliCredentials(): boolean {
  const h = home();
  if (h && existsSync(`${h}/.gemini/oauth_creds.json`)) return true;
  if (process.env.GEMINI_API_KEY) return true;
  return false;
}

export function hasAgyCliCredentials(): boolean {
  const h = home();
  const settingsPath = `${h}/.gemini/antigravity-cli/settings.json`;
  if (!h || !existsSync(settingsPath)) return false;

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      modelProvider?: unknown;
    };
    if (settings.modelProvider === 'gemini') return Boolean(process.env.GEMINI_API_KEY);
    return true;
  } catch {
    return false;
  }
}

export function hasAmpCliCredentials(): boolean {
  const h = home();
  if (h && existsSync(`${h}/.config/amp/settings.json`)) return true;
  if (h && existsSync(`${h}/.config/amp/auth.json`)) return true;
  if (process.env.AMP_API_KEY) return true;
  return false;
}

export function hasCursorCliCredentials(): boolean {
  const h = home();
  if (h && existsSync(`${h}/.cursor/config.json`)) return true;
  if (h && existsSync(`${h}/.cursor`)) return true;
  if (process.env.CURSOR_API_KEY) return true;
  return false;
}

export function hasCopilotCliCredentials(): boolean {
  const h = home();
  if (h && existsSync(`${h}/.copilot/config.json`)) return true;
  if (h && existsSync(`${h}/.copilot`)) return true;
  if (h && existsSync(`${h}/.config/gh/hosts.yml`)) return true;
  if (process.env.GITHUB_TOKEN) return true;
  return false;
}

export function hasOpencodeCliCredentials(): boolean {
  const h = home();
  if (h && existsSync(`${h}/.local/share/opencode/auth.json`)) return true;
  if (h && existsSync(`${h}/.config/opencode`)) return true;
  if (process.env.OPENCODE_AUTH_TOKEN) return true;
  if (process.env.ANTHROPIC_API_KEY) return true;
  if (process.env.OPENAI_API_KEY) return true;
  return false;
}

export function hasDroidCliCredentials(): boolean {
  const h = home();
  if (h && existsSync(`${h}/.factory/config.json`)) return true;
  if (h && existsSync(`${h}/.factory/mcp.json`)) return true;
  if (h && existsSync(`${h}/.factory`)) return true;
  if (process.env.FACTORY_API_KEY) return true;
  return false;
}

export function hasCcrCliCredentials(): boolean {
  const h = home();
  if (h && existsSync(`${h}/.claude-code-router/config.json`)) return true;
  if (h && existsSync(`${h}/.claude-code-router`)) return true;
  if (process.env.ANTHROPIC_API_KEY) return true;
  if (process.env.OPENAI_API_KEY) return true;
  return false;
}

export function hasQwenCliCredentials(): boolean {
  const h = home();
  if (h && existsSync(`${h}/.qwen/settings.json`)) return true;
  if (h && existsSync(`${h}/.qwen/installation_id`)) return true;
  if (h && existsSync(`${h}/.qwen`)) return true;
  if (process.env.DASHSCOPE_API_KEY) return true;
  if (process.env.QWEN_API_KEY) return true;
  return false;
}

export function hasAcpCredentials(): boolean {
  // The ACP meta-provider delegates to whichever binary is configured.
  // Treat the presence of an override env var as a positive signal; if none
  // is set, fall through to the default gemini path so the row surfaces as
  // "configured" whenever Gemini is signed in.
  if (process.env.KANBOTS_ACP_COMMAND && process.env.KANBOTS_ACP_COMMAND.trim().length > 0) {
    return true;
  }
  return hasGeminiCliCredentials();
}

/**
 * True if `id` has detectable credentials. Claude Code's check is injected
 * because the desktop owns the canonical Electron-safe path probe.
 */
export function hasProviderCredentials(
  id: AgentRunProvider,
  hasClaudeCodeCreds: () => boolean,
): boolean {
  switch (id) {
    case 'claude-code':
      return hasClaudeCodeCreds();
    case 'codex-cli':
      return hasCodexCliCredentials();
    case 'gemini-cli':
      return hasGeminiCliCredentials();
    case 'agy-cli':
      return hasAgyCliCredentials();
    case 'amp-cli':
      return hasAmpCliCredentials();
    case 'cursor-cli':
      return hasCursorCliCredentials();
    case 'copilot-cli':
      return hasCopilotCliCredentials();
    case 'opencode-cli':
      return hasOpencodeCliCredentials();
    case 'droid-cli':
      return hasDroidCliCredentials();
    case 'ccr-cli':
      return hasCcrCliCredentials();
    case 'qwen-cli':
      return hasQwenCliCredentials();
    case 'acp':
      return hasAcpCredentials();
    default:
      return false;
  }
}

/**
 * Resolve the provider a run should spawn on, preferring ones that actually
 * have credentials so a missing-credentials provider never silently wins.
 *
 * Precedence:
 *   1. `explicit` — honoured verbatim. The caller asked for this provider
 *      specifically (e.g. picked it in a dropdown), so even without detected
 *      credentials we spawn it and let the CLI surface its own auth error.
 *   2. `defaultProvider`, but only if it has credentials.
 *   3. The first provider in {@link PROVIDER_FALLBACK_ORDER} that has
 *      credentials. This is the fix for "I signed out of Claude Code, yet
 *      every picker-less dispatch still ran claude and failed" — when
 *      Claude has no credentials, the first credentialed provider wins.
 *   4. `'claude-code'` as the historical safety net, so dispatch still spawns
 *      (and surfaces the CLI's auth error) rather than throwing upstream.
 */
export function resolveProviderWithCreds(
  explicit: AgentRunProvider | undefined,
  defaultProvider: AgentRunProvider | undefined | null,
  hasCreds: (id: AgentRunProvider) => boolean,
): AgentRunProvider {
  if (explicit) return explicit;
  if (defaultProvider && hasCreds(defaultProvider)) return defaultProvider;
  for (const candidate of PROVIDER_FALLBACK_ORDER) {
    if (hasCreds(candidate)) return candidate;
  }
  return 'claude-code';
}
