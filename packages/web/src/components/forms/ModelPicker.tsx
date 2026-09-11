import { useEffect, useMemo } from 'react';
import { api } from '../../api.js';
import { useFetch } from '../../hooks/useFetch.js';
import type { ProviderId } from '../../types.js';

interface ModelEntry {
  id: string;
  label: string;
}

// Mirror @kanbots/llm catalogue. Keep in sync.
export const MODELS: Record<ProviderId, ModelEntry[]> = {
  'claude-code': [
    { id: 'claude-fable-5', label: 'Claude Fable 5' },
    { id: 'claude-opus-5', label: 'Claude Opus 5' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  'codex-cli': [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
  ],
  'gemini-cli': [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  ],
  'agy-cli': [
    { id: 'default', label: 'Antigravity (default)' },
    { id: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)' },
    { id: 'gemini-3.1-pro-low', label: 'Gemini 3.1 Pro (Low)' },
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
    { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
    { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' },
    { id: 'gemini-3.7-flash-high', label: 'Gemini 3.7 Flash (High)' },
    { id: 'gemini-3.7-flash-medium', label: 'Gemini 3.7 Flash (Medium)' },
    { id: 'gemini-3.7-flash-low', label: 'Gemini 3.7 Flash (Low)' },
    { id: 'gemini-3.6-flash-high', label: 'Gemini 3.6 Flash (High)' },
    { id: 'gemini-3.6-flash-medium', label: 'Gemini 3.6 Flash (Medium)' },
    { id: 'gemini-3.6-flash-low', label: 'Gemini 3.6 Flash (Low)' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Antigravity)' },
    { id: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 Thinking (Antigravity)' },
    { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Antigravity)' },
  ],
  'amp-cli': [
    { id: 'default', label: 'Amp (default)' },
  ],
  'cursor-cli': [
    { id: 'auto', label: 'Cursor (auto)' },
    { id: 'composer-2.5', label: 'Composer 2.5 (Cursor)' },
    { id: 'claude-fable-5', label: 'Claude Fable 5 (Cursor)' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (Cursor)' },
    { id: 'gpt-5.5', label: 'GPT-5.5 (Cursor)' },
  ],
  'copilot-cli': [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol (Copilot)' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (Copilot)' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Copilot)' },
    { id: 'gpt-5', label: 'GPT-5 (Copilot)' },
    { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6 (Copilot)' },
  ],
  'opencode-cli': [{ id: 'default', label: 'OpenCode (default)' }],
  'droid-cli': [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol (Droid)' },
    { id: 'glm-5.2', label: 'GLM-5.2 (Droid Core)' },
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (Droid)' },
  ],
  'ccr-cli': [{ id: 'default', label: 'CCR (router default)' }],
  'qwen-cli': [
    { id: 'qwen3.7-plus', label: 'Qwen 3.7 Plus' },
    { id: 'qwen3-coder-plus', label: 'Qwen3 Coder Plus' },
  ],
  acp: [{ id: 'default', label: 'ACP (configured agent)' }],
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  'claude-code': 'Claude Code',
  'codex-cli': 'Codex CLI',
  'gemini-cli': 'Gemini CLI',
  'agy-cli': 'Antigravity CLI',
  'amp-cli': 'Amp',
  'cursor-cli': 'Cursor Agent',
  'copilot-cli': 'GitHub Copilot',
  'opencode-cli': 'OpenCode',
  'droid-cli': 'Factory Droid',
  'ccr-cli': 'Claude Code Router',
  'qwen-cli': 'Qwen Code',
  acp: 'ACP',
};
export { PROVIDER_LABELS };

/**
 * Providers that support agent runs. Mirrors the `agentRunsOnly` filter
 * below — exported so callers that render a separate "agent" control can
 * keep the same allowlist without re-hardcoding it.
 */
export const AGENT_RUN_PROVIDERS: ReadonlyArray<ProviderId> = [
  'claude-code',
  'codex-cli',
  'gemini-cli',
  'agy-cli',
  'amp-cli',
  'cursor-cli',
  'copilot-cli',
  'opencode-cli',
  'droid-cli',
  'ccr-cli',
  'qwen-cli',
  'acp',
];

export interface ModelPickerValue {
  provider: ProviderId;
  model: string;
}

export interface ModelPickerProps {
  value: ModelPickerValue | null;
  onChange: (next: ModelPickerValue) => void;
  className?: string;
  /**
   * If true, only providers that support agent runs are shown. All shipped
   * provider CLIs qualify today, so this is currently a no-op filter —
   * kept on the API for parity with chat-only futures.
   */
  agentRunsOnly?: boolean;
}

export function ModelPicker({ value, onChange, className, agentRunsOnly }: ModelPickerProps) {
  const { data: providers } = useFetch('providers', () => api.getProviders());

  const options = useMemo(() => {
    if (!providers) return [] as Array<{ provider: ProviderId; models: ModelEntry[] }>;
    return providers.providers
      .filter((p) => p.hasKey)
      .filter((p) => (agentRunsOnly ? AGENT_RUN_PROVIDERS.includes(p.id) : true))
      .map((p) => ({ provider: p.id, models: MODELS[p.id] ?? [] }));
  }, [providers, agentRunsOnly]);

  // Auto-select first option if value is unset and options become available.
  useEffect(() => {
    if (value || options.length === 0) return;
    const first = options[0];
    if (!first || first.models.length === 0) return;
    const firstModel = first.models[0];
    if (firstModel) {
      onChange({ provider: first.provider, model: firstModel.id });
    }
  }, [value, options, onChange]);

  const selectedKey = value ? `${value.provider}:${value.model}` : '';

  return (
    <select
      className={className}
      value={selectedKey}
      onChange={(e) => {
        const [provider, model] = e.target.value.split(':') as [ProviderId, string];
        if (provider && model) onChange({ provider, model });
      }}
    >
      {options.length === 0 ? <option value="">(no providers configured)</option> : null}
      {options.map(({ provider, models }) => (
        <optgroup key={provider} label={PROVIDER_LABELS[provider]}>
          {models.map((m) => (
            <option key={`${provider}:${m.id}`} value={`${provider}:${m.id}`}>
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
