# Architecture Decision Records

This directory holds the fork's Architecture Decision Records (ADRs) — short,
dated documents that capture *why* a technical decision was made, what
alternatives were considered, and what consequences followed.

ADR-0000 defines the convention. Everything else is numbered sequentially in
the order decisions are made.

## Index

| # | Title | Status |
| --- | --- | --- |
| [0000](./0000-adopt-adr-convention.md) | Adopt ADR convention | Accepted |
| [0001](./0001-integration-vision-memory-and-cost-optimization.md) | Integration vision: memory + cost optimization | Accepted |
| [0002](./0002-agentmemory-server-lifecycle.md) | agentmemory — server lifecycle management | Accepted |
| [0003](./0003-agentmemory-mcp-wiring-into-spawned-agents.md) | agentmemory — MCP wiring into spawned agents | Accepted |
| [0004](./0004-agentmemory-memory-scoping-multi-repo.md) | agentmemory — memory scoping across repos and agents | Accepted |
| [0005](./0005-agentmemory-injection-and-checkpoint-flow.md) | agentmemory — injection and checkpoint flow | Accepted |
| [0006](./0006-rtk-cli-output-compression.md) | RTK — CLI output compression for spawned agents | Accepted |

## Status legend

- **Proposed** — drafted, open for review. The decision is *not* final.
- **Accepted** — the decision is final and binding for new work.
- **Deprecated** — superseded or no longer relevant; left for history.
- **Superseded by [NNNN]** — replaced by a later ADR.

## How to add an ADR

1. Copy the next number (`0007`, `0008`, …). Don't renumber existing files.
2. Use `docs/adr/template.md` as the starting point.
3. Status starts as **Proposed**. Flip to **Accepted** once ratified.
4. Add a row to the index table above.
5. Commit the ADR in its own commit so the history reads as a log.
