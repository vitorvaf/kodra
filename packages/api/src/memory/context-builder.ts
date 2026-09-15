/**
 * Turns recalled memories into a compact prompt block.
 *
 * Ordering: team memory first (validated, shared knowledge), then private
 * memory by relevance score, then by recency. Every item is trimmed and the
 * whole block is capped so a recall never floods the agent's context.
 */
export type MemoryScope = 'private' | 'team';

export interface MemoryContextItem {
  id?: string | null;
  content: string;
  scope: MemoryScope;
  type?: string | undefined;
  score?: number | undefined;
  createdAt?: string | undefined;
}

export interface BuildMemoryContextOptions {
  maxItems: number;
  maxChars: number;
  /** Per-item cap before the total cap applies. Default 400. */
  maxItemChars?: number;
  heading?: string;
  /** Append the line that tells the agent about the memory MCP tools. Default true. */
  mcpHint?: boolean;
}

const DEFAULT_HEADING =
  'RELEVANT_PROJECT_MEMORY — recalled from AgentMemory. Memory can be stale: when the current code contradicts it, the code wins.';
const MCP_HINT =
  'Deeper queries: `memory_recall` / `memory_smart_search`; record durable findings with `memory_save`, share validated ones with `memory_team_share`.';

function timeOf(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function rankMemoryItems<T extends MemoryContextItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'team' ? -1 : 1;
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return timeOf(b.createdAt) - timeOf(a.createdAt);
  });
}

function normalize(content: string, maxItemChars: number): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > maxItemChars ? `${flat.slice(0, maxItemChars - 1)}…` : flat;
}

export function buildMemoryContext(
  items: readonly MemoryContextItem[],
  options: BuildMemoryContextOptions,
): string | null {
  const maxItemChars = options.maxItemChars ?? 400;
  const heading = options.heading ?? DEFAULT_HEADING;
  const hint = options.mcpHint === false ? null : MCP_HINT;

  const seen = new Set<string>();
  const lines: string[] = [];
  let used = heading.length + (hint ? hint.length + 1 : 0);

  for (const item of rankMemoryItems(items)) {
    if (lines.length >= options.maxItems) break;
    const text = normalize(item.content, maxItemChars);
    if (text.length === 0) continue;
    const key = text.slice(0, 120).toLowerCase();
    if (seen.has(key)) continue;
    const tag = item.type ? `${item.scope}/${item.type}` : item.scope;
    const line = `- [${tag}] ${text}`;
    if (used + line.length + 1 > options.maxChars) break;
    seen.add(key);
    lines.push(line);
    used += line.length + 1;
  }

  if (lines.length === 0) return null;
  return [heading, ...lines, ...(hint ? [hint] : [])].join('\n');
}
