# ADR-0003: agentmemory — MCP wiring into spawned agents

- **Status**: Accepted
- **Date**: 2026-08-11
- **Deciders**: fork maintainer
- **Depends on**: ADR-0001, ADR-0002

## Context

kanbots already injects MCP servers into the agents it spawns. The contract
lives at `ChatToolRuntime.prepareForRun()` (`packages/api/src/handlers/types.ts:41-54`),
called from `packages/api/src/handlers/chat.ts:416-454`. It returns
provider-specific `extraArgs` and `env` that `startAgentRun()`
(`packages/dispatcher/src/worker.ts:127-163`) merges into the child-process
spawn. Concretely:

- **Claude Code** adapter (`packages/dispatcher/src/adapters/claude-code.ts:28-30`)
  appends `--mcp-config <file>` pointing at a transient JSON written under
  `.kanbots/mcp-runtime/mcp-<uuid>.json` (see `docs/configuration.md:133-145`).
- **Codex** adapter uses repeated `-c mcp_servers.<name>.*` overrides instead
  of a file.
- Today this wiring is used for kanbots's **own** MCP server (the tool bridge
  that lets agents drive the board back), not for third-party MCP servers.

agentmemory's MCP entry, for reference, is the standard shape:

```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": { "AGENTMEMORY_URL": "http://localhost:3111" }
    }
  }
}
```

The challenge: kanbots spawns 11 different agents
(`packages/dispatcher/src/worker.ts:19-44`), each behind its own
`AgentCliAdapter` (`packages/dispatcher/src/adapters/types.ts:3-33`). They do
not all accept MCP config the same way (some via file, some via CLI flags,
some via a config dir, and a few likely have no MCP support at all). The
wiring decision has to cover all of them or define a clean fallback.

### Forces

- The existing `prepareForRun()` pattern is runtime-generated and transient —
  nothing persists in `.kanbots/config.json` about which MCP servers a
  workspace wants. That has been fine because there was only ever one MCP
  server (kanbots's own). Adding agentmemory is the first *user-visible,
  toggleable* MCP server.
- `agentmemory connect <agent>` writes to the user's global agent config
  (`~/.claude/settings.json`, `~/.cursor/mcp.json`, `.codex/config.toml`,
  `~/.gemini/settings.json`, …). That works for agents the user runs by hand,
  but kanbots's spawned agents run in worktrees and may be invoked with
  explicit flags that bypass or override global config. Relying on global
  config is fragile.
- Some agents (e.g., `acp`, smaller CLIs) may not support MCP at all. Memory
  for those has to come from a different path (see ADR-0005's active-injection
  fallback).

## Decision

**Extend `prepareForRun()` to inject agentmemory as a workspace-controlled MCP
server, with a persisted toggle and per-adapter translation. A REST-API
fallback covers MCP-less agents.**

1. **Persisted toggle, runtime wiring.** Add a `memory` section to
   `.kanbots/config.json` (validated by `packages/local-store/src/workspace.ts`,
   same pattern as `containmentMode` / `checks`):

   ```jsonc
   {
     "memory": {
       "enabled": true,
       "provider": "agentmemory",
       "url": "http://localhost:3111",
       "secret": null,
       "scope": "shared"            // see ADR-0004
     }
   }
   ```

   `enabled: false` (or omission) means "no memory wiring injected" — fully
   backward-compatible with upstream kanbots.

2. **Extend the runtime contract.** `ChatToolRuntime.prepareForRun()` gains a
   memory-aware code path: when `memory.enabled` is set, it appends the
   agentmemory MCP entry to whatever per-run MCP config the adapter already
   builds. For file-based adapters (Claude Code), that means merging into the
   transient `.kanbots/mcp-runtime/mcp-<uuid>.json` (alongside the kanbots
   tool-bridge entry, not replacing it). For flag-based adapters (Codex), it
   means emitting the extra `-c mcp_servers.agentmemory.*` overrides. The
   `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` env vars are passed through the
   spawn `env` (`worker.ts:46-70` already supports a merged child env).

3. **Per-adapter capability flag.** Extend `AgentCliAdapter`
   (`adapters/types.ts:3-33`) with an optional
   `mcpSupport?: 'file' | 'flags' | 'config-dir' | 'none'`. Adapters that
   declare `'none'` are routed to the REST-API fallback in ADR-0005 (kanbots
   injects recalled context into the prompt prefix instead of wiring MCP).
   This keeps the adapter interface the single source of truth for "what this
   CLI can do."

4. **Never mutate the user's global config.** Unlike `agentmemory connect`,
   kanbots does **not** write to `~/.claude/settings.json` or equivalent. All
   wiring is workspace-scoped and transient, consistent with how kanbots
   already isolates per-run state under `.kanbots/`.

5. **Coexistence with the kanbots tool-bridge MCP.** agentmemory's entry sits
   beside the existing kanbots entry in the same MCP config; the agent sees
   both. No conflict, because they expose disjoint tool namespaces
   (`memory_*` vs. kanbots's `listIssues` / `dispatchAgent` / etc.).

## Alternatives Considered

### Option A — Rely on `agentmemory connect` writing global config
Rejected. (a) Spawns agents in worktrees may not read global config (explicit
`--mcp-config` overrides it for Claude; kanbots already uses this). (b) It
mutates the user's environment outside `.kanbots/`, violating the
workspace-isolation principle documented in `docs/configuration.md`. (c) It
applies to *all* the user's agent invocations, not just kanbots runs —
unwanted side effect.

### Option B — Persist a full per-agent MCP config table in SQLite
Over-engineered for now. We only have one third-party MCP server to wire
(agentmemory); a generalized "MCP marketplace" table is speculative. The
`memory` section in `config.json` is the minimal shape. If a second or third
external MCP server becomes relevant, promote to a `mcpServers:` array and
revisit — that's a future ADR.

### Option C — Pure env-var propagation (`AGENTMEMORY_URL` in the spawn env)
Rejected as the *sole* mechanism. Env vars alone don't register the MCP
server with the agent — the agent still needs the `mcpServers` entry to know
to spawn the `@agentmemory/mcp` shim. Env vars are necessary (the shim reads
them) but not sufficient.

### Option D — Build a kanbots-side MCP proxy that fronts agentmemory
Rejected. Adds an indirection layer with no benefit; the agentmemory MCP shim
already exists and is maintained upstream.

## Consequences

**Positive:**
- One extension point (`prepareForRun()`) covers all MCP-capable agents,
  consistent with the existing kanbots-tool-bridge wiring.
- Persisted toggle means memory is opt-in per workspace; upstream kanbots
  behavior is the default.
- Adapter capability flag keeps "which CLIs support MCP" explicit in the
  adapter registry, not hidden in scattered conditionals.
- No mutation of user-global config — kanbots stays inside `.kanbots/`.

**Negative:**
- Every adapter that declares `mcpSupport` needs the translation logic
  written and tested (Claude file-merge, Codex flags, Gemini/Cursor config-dir
  variants). 11 adapters × a format each = real surface area.
- The transient MCP file format must support multiple servers cleanly; need
  to confirm the current `mcp-<uuid>.json` writer already produces a
  `mcpServers: { … }` object (not a single-server shape).
- Adapters with `mcpSupport: 'none'` depend on ADR-0005's fallback, so 0003
  and 0005 are coupled in practice.

**Neutral:**
- A migration in `packages/local-store/src/migrations/` (next number after
  `0019_project_scope`) may be needed if we persist any memory state beyond
  `config.json`. For the wiring itself, `config.json` suffices — no migration.

## References

- `packages/api/src/handlers/types.ts:41-54` — `ChatToolRuntime.prepareForRun`
- `packages/api/src/handlers/chat.ts:416-454` — chat prompt + MCP prep
- `packages/dispatcher/src/worker.ts:19-44` (11 providers),
  `:46-70` (env merge), `:127-163` (spawn)
- `packages/dispatcher/src/adapters/types.ts:3-33` — `AgentCliAdapter`
- `packages/dispatcher/src/adapters/claude-code.ts:28-30` — `--mcp-config`
- `docs/configuration.md:133-145` — `.kanbots/mcp-runtime/mcp-<uuid>.json`
- agentmemory MCP shape — ADR-0001 references,
  `packages/mcp/README.md` upstream
