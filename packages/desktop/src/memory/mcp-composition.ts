import type { MemoryConfig } from '@kanbots/local-store';

export interface McpServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** Returns the agentmemory MCP server entry, or null when memory is disabled. */
export function agentMemoryMcpEntry(mem: MemoryConfig | undefined): McpServerEntry | null {
  if (!mem || !mem.enabled) return null;
  const env: Record<string, string> = { AGENTMEMORY_URL: mem.url };
  if (mem.secret) env.AGENTMEMORY_SECRET = mem.secret;
  return { command: 'npx', args: ['-y', '@agentmemory/mcp'], env };
}

/** Merge the agentmemory entry into a base mcpServers object (non-codex path). */
export function withAgentMemory(
  base: Record<string, McpServerEntry>,
  mem: MemoryConfig | undefined,
): Record<string, McpServerEntry> {
  const entry = agentMemoryMcpEntry(mem);
  return entry ? { ...base, agentmemory: entry } : base;
}
