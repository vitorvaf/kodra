import type { Store } from '@kanbots/local-store';

const MAX_PROMPT_LEN = 200;
const MAX_RECENT_FILES = 10;
const RECENT_WINDOW_MS = 60_000;

export const BRIEFING_MARKER = '[kanbots:sibling-briefing]';

export function renderSiblingBriefing(store: Store, currentRunId: number): string | null {
  const active = store.agentRuns.listActive();
  const siblings = active.filter((r) => r.id !== currentRunId);
  if (siblings.length === 0) return null;

  const cutoff = Date.now() - RECENT_WINDOW_MS;
  const lines: string[] = [];
  lines.push('## Other agents currently running');
  lines.push('');
  lines.push(
    'Other Kanbots agents are running concurrently in sibling worktrees. They cannot see your changes and you cannot see theirs until each opens a PR. Treat the list below as awareness, not as a lock.',
  );
  lines.push('');

  for (const sib of siblings) {
    const messages = store.messages.list(sib.threadId);
    const firstUser = messages.find((m) => m.role === 'user');
    const originalPrompt = firstUser ? truncate(firstUser.body, MAX_PROMPT_LEN) : '(unknown)';

    lines.push(`- Issue #${sib.issueNumber} (run ${sib.id}, status: ${sib.status})`);
    lines.push(`  branch: ${sib.branchName ?? '(none)'}`);
    lines.push(`  worktree: ${sib.worktreePath ?? '(none)'}`);
    lines.push(`  prompt: ${originalPrompt}`);

    const files = recentFiles(store, sib.id, cutoff);
    if (files.length > 0) {
      lines.push(`  recently touched: ${files.join(', ')}`);
    }
  }

  lines.push('');
  lines.push(
    'If your task overlaps with one of these, prefer narrower changes or surface a decision rather than racing them.',
  );
  return lines.join('\n');
}

function recentFiles(store: Store, runId: number, cutoffMs: number): string[] {
  const events = store.events.list(runId);
  const out: string[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < MAX_RECENT_FILES; i--) {
    const ev = events[i];
    if (!ev || ev.type !== 'tool_use') continue;
    if (new Date(ev.createdAt).getTime() < cutoffMs) break;
    const payload = ev.payload as { name?: string; input?: unknown } | null;
    const path = extractFilePath(payload?.input);
    if (path && !out.includes(path)) out.push(path);
  }
  return out;
}

function extractFilePath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  for (const key of ['file_path', 'path', 'notebook_path', 'filePath']) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}
