import type { ModelEntry, ProviderId } from './types.js';

/**
 * Static model catalogue shipped with the app. Update when providers ship new
 * flagship models. The Settings UI reads this to populate per-provider model
 * dropdowns; the model picker reads it to render grouped options.
 */
export const MODELS: ModelEntry[] = [
  // Claude Code subscription. Fable 5 is the current flagship (aliases:
  // 'fable'/'opus'/'sonnet' in the claude CLI). claude-mythos-5 is
  // restricted to approved orgs (Project Glasswing) and deliberately not
  // catalogued. Plain claude-fable-5 runs the standard 200K window — the
  // 1M window is a separate opt-in selector (claude-fable-5[1m]) the CLI
  // resolves on its own.
  {
    provider: 'claude-code',
    id: 'claude-fable-5',
    label: 'Claude Fable 5',
    contextWindow: 200_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'claude-code',
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'claude-code',
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'claude-code',
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'claude-code',
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'claude-code',
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'claude-code',
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    contextWindow: 200_000,
    toolUse: true,
  },
  // Codex CLI (OpenAI agentic CLI). The 5.6 family is the current lineup
  // (sol flagship / terra balanced / luna fast-cheap); gpt-5.4 & 5.4-mini
  // were retired from Codex on 2026-08-31 and are not catalogued.
  {
    provider: 'codex-cli',
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    contextWindow: 1_000_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'codex-cli',
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'codex-cli',
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'codex-cli',
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'codex-cli',
    id: 'gpt-5',
    label: 'GPT-5',
    contextWindow: 400_000,
    toolUse: true,
  },
  {
    provider: 'codex-cli',
    id: 'gpt-5-mini',
    label: 'GPT-5 mini',
    contextWindow: 400_000,
    toolUse: true,
  },
  // Google Gemini CLI is in maintenance for individual accounts (replaced by
  // Antigravity CLI since June 2026). NOTE: v0.55.1 silently rewrites any
  // `--model gemini-X.Y-flash` to gemini-3.5-flash — 3.5 is catalogued
  // deliberately as the correctly-routing fallback.
  {
    provider: 'gemini-cli',
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro (Preview)',
    contextWindow: 1_000_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'gemini-cli',
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'gemini-cli',
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  // Google Antigravity CLI (agy). Slugs come from `agy models` — the
  // -high/-medium/-low suffix bakes the reasoning effort into the slug.
  // Non-Google models (Claude, GPT-OSS) are also served through agy.
  // `default` lets agy pick and is filtered out before argv (the CLI has
  // no such slug).
  {
    provider: 'agy-cli',
    id: 'default',
    label: 'Antigravity (default)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.1-pro-high',
    label: 'Gemini 3.1 Pro (High)',
    contextWindow: 1_000_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.1-pro-low',
    label: 'Gemini 3.1 Pro (Low)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.8-flash-high',
    label: 'Gemini 3.8 Flash (High)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.8-flash-medium',
    label: 'Gemini 3.8 Flash (Medium)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.8-flash-low',
    label: 'Gemini 3.8 Flash (Low)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.7-flash-high',
    label: 'Gemini 3.7 Flash (High)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.7-flash-medium',
    label: 'Gemini 3.7 Flash (Medium)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.7-flash-low',
    label: 'Gemini 3.7 Flash (Low)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.6-flash-high',
    label: 'Gemini 3.6 Flash (High)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.6-flash-medium',
    label: 'Gemini 3.6 Flash (Medium)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gemini-3.6-flash-low',
    label: 'Gemini 3.6 Flash (Low)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6 (Antigravity)',
    contextWindow: 200_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'claude-opus-4-6-thinking',
    label: 'Claude Opus 4.6 Thinking (Antigravity)',
    contextWindow: 200_000,
    toolUse: true,
  },
  {
    provider: 'agy-cli',
    id: 'gpt-oss-120b-medium',
    label: 'GPT-OSS 120B (Antigravity)',
    contextWindow: 200_000,
    toolUse: true,
  },
  // Sourcegraph Amp CLI. Amp routes to its own configured backend; the
  // `default` id is a placeholder for "let amp pick" until the CLI exposes
  // a stable model selector.
  {
    provider: 'amp-cli',
    id: 'default',
    label: 'Amp (default)',
    contextWindow: 200_000,
    toolUse: true,
    recommended: true,
  },
  // Cursor Agent CLI. Slugs verified against cursor-agent --list-models Sept
  // 2026; the namespace evolves quickly, so keep this list curated.
  {
    provider: 'cursor-cli',
    id: 'auto',
    label: 'Cursor (auto)',
    contextWindow: 200_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'cursor-cli',
    id: 'composer-2.5',
    label: 'Composer 2.5 (Cursor)',
    contextWindow: 200_000,
    toolUse: true,
  },
  {
    provider: 'cursor-cli',
    id: 'claude-fable-5',
    label: 'Claude Fable 5 (Cursor)',
    contextWindow: 200_000,
    toolUse: true,
  },
  {
    provider: 'cursor-cli',
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5 (Cursor)',
    contextWindow: 200_000,
    toolUse: true,
  },
  {
    provider: 'cursor-cli',
    id: 'gpt-5.5',
    label: 'GPT-5.5 (Cursor)',
    contextWindow: 400_000,
    toolUse: true,
  },
  // GitHub Copilot CLI. Curated subset of Copilot's supported list (GA Sept
  // 2026); gemini-3.8-flash was added 2026-09-03.
  {
    provider: 'copilot-cli',
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol (Copilot)',
    contextWindow: 256_000,
    toolUse: true,
  },
  {
    provider: 'copilot-cli',
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5 (Copilot)',
    contextWindow: 200_000,
    toolUse: true,
  },
  {
    provider: 'copilot-cli',
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash (Copilot)',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'copilot-cli',
    id: 'gpt-5',
    label: 'GPT-5 (Copilot)',
    contextWindow: 256_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'copilot-cli',
    id: 'claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6 (Copilot)',
    contextWindow: 200_000,
    toolUse: true,
  },
  // SST OpenCode. OpenCode routes to whichever providers the user
  // configured in `~/.config/opencode/` — `default` lets opencode pick;
  // explicit ids let the user pin a specific upstream.
  {
    provider: 'opencode-cli',
    id: 'default',
    label: 'OpenCode (default)',
    contextWindow: 200_000,
    toolUse: true,
    recommended: true,
  },
  // Factory Droid. Factory default moved to gpt-5.6-sol in droid v0.209.0
  // (2026-09-01); `droid-1` was a product label, not a model slug. glm-5.2
  // is a Droid Core open model (no API key).
  {
    provider: 'droid-cli',
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol (Droid)',
    contextWindow: 1_000_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'droid-cli',
    id: 'glm-5.2',
    label: 'GLM-5.2 (Droid Core)',
    contextWindow: 200_000,
    toolUse: true,
  },
  {
    provider: 'droid-cli',
    id: 'claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5 (Droid)',
    contextWindow: 200_000,
    toolUse: true,
  },
  // Claude Code Router. CCR routes to whichever provider the user
  // configured in `~/.claude-code-router/config.json`; `default` defers
  // entirely to the router config.
  {
    provider: 'ccr-cli',
    id: 'default',
    label: 'CCR (router default)',
    contextWindow: 200_000,
    toolUse: true,
    recommended: true,
  },
  // Qwen Code. The CLI accepts upstream Qwen model ids; `qwen3-coder-plus`
  // is the current flagship coding variant.
  {
    provider: 'qwen-cli',
    id: 'qwen3.7-plus',
    label: 'Qwen 3.7 Plus',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'qwen-cli',
    id: 'qwen3-coder-plus',
    label: 'Qwen3 Coder Plus',
    contextWindow: 1_000_000,
    toolUse: true,
    recommended: true,
  },
  // ACP meta-provider. Model selection is delegated to the underlying
  // ACP server — the catalogue exposes a single `default` entry so the
  // model picker has something to show; the user configures the actual
  // model in the ACP server's own settings (or via the workspace
  // `acp_command` override).
  {
    provider: 'acp',
    id: 'default',
    label: 'ACP (configured agent)',
    contextWindow: 200_000,
    toolUse: true,
    recommended: true,
  },
];

export function modelsForProvider(provider: ProviderId): ModelEntry[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function recommendedModel(provider: ProviderId): ModelEntry | null {
  return (
    MODELS.find((m) => m.provider === provider && m.recommended) ??
    MODELS.find((m) => m.provider === provider) ??
    null
  );
}

export function findModel(provider: ProviderId, id: string): ModelEntry | null {
  return MODELS.find((m) => m.provider === provider && m.id === id) ?? null;
}
