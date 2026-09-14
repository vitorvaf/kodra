# Agent rules for this repository

These rules apply to any coding agent working in this repo (OpenCode, Claude
Code, Codex, Kodra runs). Keep them short; the full design is in
[docs/agent-memory.md](docs/agent-memory.md).

## Project memory (AgentMemory over MCP)

When the `agentmemory` MCP server is available, use it as the project's
persistent memory. Identify every write with the project id from the
environment (`AGENTMEMORY_PROJECT`, default `kodra`).

**Before a non-trivial task** (a bug, an integration, an architectural change,
anything that smells like "we may have seen this before"), recall first:

- `memory_smart_search` / `memory_recall` with a short natural-language query
  ("ACK duplicado", "why SSE instead of WebSocket", "release pipeline race").
- Also check `memory_team_feed` for validated team knowledge.
- Treat results as hints. Memory can be stale or superseded: if the current
  code contradicts a memory, the code wins. Do not delete old memories without
  a reason; prefer saving a newer memory that states what changed.

**Write a memory only when it is worth keeping** (`memory_save`, with
`project` set and `type` in `architecture | bug | pattern | workflow |
preference | fact`, and `concepts` such as `kind:bug`, `source:agent`,
`confidence:hypothesis`):

- an architectural decision and its reason
- a confirmed bug or an external system's surprising behaviour
- a constraint, a business rule, a project convention
- an attempt that failed and why
- the conclusion of an investigation

Do **not** save progress chatter ("opening the file", "running tests", "done"),
secrets, tokens, `.env` contents, or whole files.

**Private first, team after validation.** New findings are private. Only after
the finding is confirmed (tests, a reviewed PR, an ADR) promote it with
`memory_team_share` (`itemType: "memory"`). Never bulk-share.

If the memory server is unreachable, continue the task without it.

## Knowledge graph (graphify)

`graphify-out/graph.json` is a knowledge graph of this codebase. For questions
about architecture, file relationships or "what calls what", run
`graphify query "<question>"` before grepping.
