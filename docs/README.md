# kanbots docs

Reference for the local desktop edition. The [main README](../README.md)
covers what kanbots is, install, and a quick run; this directory goes
deeper.

## By topic

- **[Getting started](getting-started.md)** — install, first run, picking a
  workspace, what gets written to disk.
- **[Agents](agents.md)** — how Claude Code and Codex runs are
  dispatched, decision prompts, containment, cost budgets, autopilot,
  parallelism, personas.
- **[Issues](issues.md)** — local mode vs. GitHub mode, GitHub auth, the
  `IssueSource` contract, and Sentry import.
- **[MCP server](mcp-server.md)** — running `kanbots-mcp-server` and
  wiring it into Cursor or Claude Desktop.
- **[Configuration](configuration.md)** — full reference for
  `.kanbots/config.json`, environment variables, and check command
  overrides.
- **[Architecture](architecture.md)** — package layout, IPC bridge,
  database schema, dependency graph.
- **[Providers](providers.md)** — picking the agent CLI (Claude Code
  vs. Codex), API key storage, and the chat panel's HTTP backends.

## Conventions

- Paths are written relative to the **repo root** unless noted otherwise.
- `.kanbots/` always means the `.kanbots/` inside the workspace you opened
  — not this repo's own.
- Branch names from agents follow `kanbots/issue-<number>-<runId>`.
- Status keys are: `backlog`, `todo`, `inProgress`, `review`, `done`. They
  map to GitHub labels `status:backlog`, `status:todo`, `status:in-progress`,
  `status:review`, `status:done`.
- Agent state keys are: `idle`, `queued`, `running`, `blocked`, `review`,
  `failed`. They map to `agent:*` labels in GitHub mode.
