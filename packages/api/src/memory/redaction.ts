/**
 * Basic credential detector for memory writes.
 *
 * Memories are shared, long-lived text. A token pasted into a note would leak
 * to every developer and agent with access to the AgentMemory server, so the
 * provider refuses to store content that matches a known credential shape.
 * The detector reports only the *label* of what matched, never the value.
 */
interface CredentialPattern {
  label: string;
  pattern: RegExp;
}

const PATTERNS: readonly CredentialPattern[] = [
  { label: 'private-key-block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    label: 'github-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  { label: 'openai-or-anthropic-key', pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { label: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: 'google-oauth-secret', pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { label: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { label: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/i },
  {
    label: 'credential-assignment',
    // `FOO_SECRET=…`, `apiKey: "…"`, `password = …` — the key may carry a prefix
    // (AGENTMEMORY_SECRET), so no leading word boundary.
    pattern:
      /[A-Za-z0-9_.-]*(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|token|password|passwd|pwd)\s*[:=]\s*["']?[^\s"'`]{8,}/i,
  },
  { label: 'url-with-password', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s@]+@/i },
];

/** Returns the labels of every credential shape found in `text` (empty when clean). */
export function findCredentials(text: string): string[] {
  const found: string[] = [];
  for (const { label, pattern } of PATTERNS) {
    if (pattern.test(text)) found.push(label);
  }
  return found;
}

export function containsCredentials(text: string): boolean {
  return findCredentials(text).length > 0;
}
