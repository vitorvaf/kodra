# ADR-0001: Integration vision — memory + cost optimization

- **Status**: Accepted
- **Date**: 2026-08-11
- **Deciders**: fork maintainer
- **Supersedes**: the three-tier mental model ("kanbots → agentmemory → rtk as
  toolkit layer") discussed during fork planning.

## Context

The fork's goal is to make kanbots's dispatched agent runs less stateless and
less expensive. Two external projects were candidates, with very different
shapes than initially assumed:

**agentmemory** (`rohitg00/agentmemory`, ~26.9k★, Apache-2.0) is a persistent
*memory server* for coding agents. It runs a local daemon (REST on `:3111`,
stream on `:3112`, web viewer on `:3113`, iii-engine WebSocket on `:49134`),
exposes a stdio MCP shim (`@agentmemory/mcp`) that proxies to the REST API,
and offers hybrid search (BM25 + vector via local `all-MiniLM-L6-v2` +
knowledge graph), confidence scoring, lifecycle hooks, and team-scoped
namespaces. Data lives in SQLite via the iii engine; no external DB, no cloud
account, no LLM key required (provider keys only unlock richer
auto-summarization).

**rtk** (`rtk-ai/rtk`, ~75.8k★, Apache-2.0, "Rust Token Killer") is a *CLI
output compressor* — a single Rust binary that intercepts verbose command
output (`git status`, `cargo test`, `pytest`, …) and replaces it with compact
summaries before the agent reads it. It is **not** an agent framework, **not**
an MCP server, and **not** a memory/context system. It integrates via a
`PreToolUse` hook (`rtk init -g`) that transparently rewrites
`git status` → `rtk git status`. Token-savings estimates are bytes-based
(`bytes / 4`, no tokenizer); the percentages are reliable ratios, the absolute
counts are approximate.

The original planning model imagined rtk as a "toolkit/utilities layer that
connects everything." That is incorrect: rtk has zero overlap with memory,
orchestration, or MCP. The two tools are **orthogonal**. This ADR records the
corrected model so the component ADRs (0002–0006) share one frame.

### Forces

- kanbots dispatches one agent run per issue in an isolated worktree
  (`packages/dispatcher/src/worker.ts`, `packages/api/src/agent-runs/supervisor.ts`).
  Each run is effectively stateless: nothing the agent learned carries to the
  next run on the same module.
- kanbots already tracks per-run and per-session USD cost
  (`runCostBudgetUsd`, `sessionCostBudgetUsd` in `.kanbots/config.json`) and
  stops runs that breach the cap. Command-output tokens are a meaningful slice
  of that cost.
- kanbots already speaks MCP: `ChatToolRuntime.prepareForRun()`
  (`packages/api/src/handlers/types.ts:41-54`) builds provider-specific MCP
  args (`--mcp-config` for Claude, `-c mcp_servers.*` for Codex) and writes
  transient configs to `.kanbots/mcp-runtime/mcp-<uuid>.json`.

## Decision

We adopt a **two-axis** integration model rather than a layered one:

1. **agentmemory becomes the fork's memory layer.** Spawned agents gain the
   ability to recall project context, past decisions, and patterns before they
   start, and to checkpoint what they did when they finish. This is the
   primary, transformative integration. Covered by ADR-0002 (server
   lifecycle), ADR-0003 (MCP wiring), ADR-0004 (scoping), ADR-0005 (injection
   & checkpoint flow).

2. **rtk becomes an optional cost-optimization layer.** It compresses the
   shell-command output that agents generate inside worktrees, lowering the
   token share of build/test/git noise and giving the existing cost budgets
   more headroom. It is independent of agentmemory and can be adopted (or not)
   on its own. Covered by ADR-0006.

The two axes are deliberately decoupled: either can be integrated, used, or
rolled back without the other. The fork does **not** introduce a "rtk
orchestration layer" between kanbots and the agents.

### Priority

agentmemory first (ADRs 0002–0005). It is the larger quality win and unblocks
cross-run continuity. rtk (ADR-0006) follows; it is a smaller, self-contained
cost win with no dependency on the memory work.

## Alternatives Considered

### Option A — The original three-tier model (rtk as toolkit/orchestration layer)
Rejected. Based on a misidentification of rtk. rtk exposes no orchestration,
no SDK adapters, no pipeline runner. Forcing it into a layer it doesn't occupy
would mean building that layer ourselves and bolting rtk on as a tenant —
scope creep with no payoff. The two-axis model captures the real value of both
projects at lower integration cost.

### Option B — agentmemory only; defer rtk indefinitely
Considered and rejected for now. rtk's hook-based integration is cheap enough
(document-only at first, per ADR-0006) that excluding it removes a real cost
savings for trivial reasons. We keep it in scope but sequenced last and
decoupled.

### Option C — Build an in-house memory + output compression instead of integrating
Rejected. agentmemory already solves memory (hybrid search, knowledge graph,
54 MCP tools, 12 lifecycle hooks, mature codebase). rtk already solves output
compression (64 command filters, mature Rust binary). Re-implementing either
diverts effort from the parts of the fork that are genuinely kanbots-specific
(dispatch integration, scoping, prompt injection).

## Consequences

**Positive:**
- One coherent frame for the next five ADRs; no false dependencies between
  them.
- agentmemory and rtk can be integrated, tested, and rolled back
  independently — useful if either upstream changes shape.
- The cost-budget feature (`runCostBudgetUsd`) gets a natural complement in
  rtk and a quality complement in agentmemory, without the two competing.

**Negative:**
- Two external dependencies instead of one cohesive "platform." Each carries
  its own upgrade cycle, port/footprint, and failure modes (agentmemory's
  iii-engine pinning and port conflicts; rtk's transparent-rewrite surface
  area).
- The corrective framing means anyone who read the earlier planning notes
  needs to unlearn the three-tier picture.

**Neutral:**
- ADR-0002 through ADR-0006 are now unblocked and can be drafted in any order.
- This ADR says nothing about *how* either tool is wired; that is the job of
  the component ADRs.

## References

- agentmemory README — https://github.com/rohitg00/agentmemory/blob/main/README.md
- agentmemory MCP package — https://github.com/rohitg00/agentmemory/blob/main/packages/mcp/README.md
- rtk README — https://github.com/rtk-ai/rtk/blob/develop/README.md
- rtk ARCHITECTURE — https://github.com/rtk-ai/rtk/blob/develop/docs/contributing/ARCHITECTURE.md
- `packages/dispatcher/src/worker.ts`, `packages/api/src/agent-runs/supervisor.ts`
- `packages/api/src/handlers/types.ts:41-54` (`ChatToolRuntime.prepareForRun`)
- `docs/configuration.md` (cost budgets)
