# ADR-0005: agentmemory — injection and checkpoint flow

- **Status**: Accepted
- **Date**: 2026-08-11
- **Deciders**: fork maintainer
- **Depends on**: ADR-0001, ADR-0002, ADR-0003, ADR-0004

## Context

Wiring the MCP server (ADR-0003) and scoping memory (ADR-0004) make
agentmemory *reachable* from spawned agents. They don't guarantee the agent
*uses* it. Two failure modes:

1. **No recall.** The agent never calls `memory_recall` and re-derives
   everything from scratch — the integration produces no quality gain.
2. **No checkpoint.** The agent finishes a run without writing anything to
   memory, so the *next* run has nothing to recall. The memory layer stays
   empty.

kanbots's dispatch flow has two natural injection points (confirmed by
`packages/api/src/agent-runs/supervisor.ts`):

- **Pre-run:** `composeSystemPrompt(run.id, input.appendSystemPrompt)` at
  `supervisor.ts:1032-1041`, delivered to Claude via `--append-system-prompt`
  (`adapters/claude-code.ts:19-24`) or to other adapters via the
  `composePrompt()` adapter method. This is the existing prompt-prefix channel.
- **Post-run:** the `close` handler at `supervisor.ts:671-764` classifies the
  terminal status (`complete` / `failed` / `stopped` / `awaiting_input`), and
  `opts.onRunComplete` (`supervisor.ts:758-762`) fires once per run with the
  final result (including the USD cost and the full event stream is available
  in `agent_events`).

agentmemory itself ships 12 lifecycle hooks (SessionStart, UserPromptSubmit,
PreToolUse, PostToolUse, PreCompact, Stop, …) that can auto-capture and
auto-inject when wired into the agent's config. So there are two independent
actors who *could* drive injection/checkpoint: **the agent** (via
agentmemory's own hooks + MCP tool calls) and **kanbots** (via prompt prefix
+ transcript reading).

### Forces

- Pure passive (just wire MCP, hope the agent calls it) risks failure mode #1
  — smaller models and less capable CLIs may ignore the `memory_*` tools.
- Pure active (kanbots reads the transcript and writes memory itself)
  duplicates agentmemory's own hook system and forces kanbots to parse agent
  output semantically — expensive, brittle, and version-coupled to each
  adapter's event schema.
- The `result` event already carries cost and status; the `text` / `tool_use`
  / `tool_result` events in `agent_events` are the raw material for a
  checkpoint. But summarizing them into a *memory* is exactly what
  agentmemory's own consolidation does best.
- Prompt-prefix tokens count against the run's cost budget; injecting a huge
  recalled blob eats budget. Recall must be selective.

## Decision

**Hybrid: kanbots nudges + injects a compact recall pre-run; the agent writes
its own checkpoint via agentmemory's hooks + MCP tools; kanbots provides a
fallback checkpoint only when the agent demonstrably didn't.**

1. **Pre-run: compact recall in the prompt prefix.** Before
   `startAgentRun()`, kanbots calls agentmemory's REST endpoint
   (`POST /agentmemory/smart-search` on `:3111`) with the issue title + body
   as the query, scoped per ADR-0004's namespace. It takes the **top-K
   results** (K=3 to start, tunable), formats them as a short "Relevant
   project memory" block, and prepends that block to `appendSystemPrompt` in
   `composeSystemPrompt()`. This guarantees every run *starts* with context,
   even if the agent never calls `memory_recall` itself.

   The block is explicitly bounded (token-capped) and ends with the line:
   *"You also have `memory_recall` / `memory_smart_search` MCP tools for
   deeper queries."* — turning the passive MCP wiring from ADR-0003 into an
   active affordance the agent knows about.

2. **Checkpoint: agent-driven by default.** agentmemory's own hooks
   (SessionStart, PostToolUse, Stop) do the heavy lifting of observation
   capture and consolidation when wired via ADR-0003. The `Stop` hook writes
   the session summary; `memory_save` / `memory_lessons_save` are available
   to the agent as MCP tools it can call deliberately for "I decided X
   because Y" entries. This is the primary checkpoint path — zero kanbots
   code beyond the wiring.

3. **Fallback checkpoint: kanbots only when the agent didn't.** In
   `opts.onRunComplete`, kanbots checks (via a quick REST call to
   `memory_sessions` for the run's session ID) whether anything was written
   for this run. If **nothing** was recorded and the run reached `complete`
   status, kanbots writes a minimal entry itself: issue title, run status,
   final cost, branch/worktree path, and the issue URL. It does **not**
   attempt to summarize the work — that's agentmemory's job, and a missing
   summary means the agent/hooks didn't fire, not that kanbots should
   improvise one. This prevents silent memory gaps without coupling kanbots
   to each adapter's event schema.

4. **Cost-aware recall.** The pre-run recall's token cost is added to the
   run's accumulated cost (it lives in the prompt). If the recall would
   push the run over `runCostBudgetUsd` before the agent even starts, kanbots
   trims K (drops to K=1, then to a one-line "memory available, query via
   MCP") rather than skipping entirely. A run with zero budget left skips
   the injected block but keeps MCP wired.

5. **Decision-event capture.** When the agent emits a `decision` event
   (`stream-parser.ts`, persisted to `agent_events`) and the user resolves
   it, kanbots writes the (question, chosen option) pair to memory under the
   run's session. These are high-value, human-validated decisions — exactly
   what future runs should recall. This is the one piece of *kanbots-native*
   memory content, because kanbots is the only actor that sees the resolved
   decision.

## Alternatives Considered

### Option A — Pure passive (wire MCP only; agent decides)
Rejected as sole mechanism. Depends entirely on the agent choosing to call
`memory_recall`. For weaker models or tightly-scoped agents, recall never
happens and the integration looks broken. The pre-run prefix injection in
Decision 1 makes recall guaranteed, not optional.

### Option B — Pure active (kanbots reads transcript, summarizes, writes)
Rejected. (a) Duplicates agentmemory's consolidation engine. (b) kanbots
would have to understand 11 adapters' event schemas to summarize faithfully.
(c) The summary quality would be worse than agentmemory's purpose-built
hybrid search + LLM consolidation. Keep kanbots's role to the minimal
fallback in Decision 3.

### Option C — agentmemory hooks only; no kanbots involvement
Tempting (least kanbots code) but rejected because hook support varies across
the 11 agents. The agents that don't support hooks (or where the user hasn't
run `agentmemory connect`) would get neither recall nor checkpoint. The
hybrid covers them via prompt prefix + onRunComplete fallback.

### Option D — Inject the full recall into every prompt; no MCP
Rejected. (a) Blows the cost budget on large memories. (b) The agent loses
the ability to query deeper on demand. MCP stays wired so the agent can dig
further; the prefix is just the guaranteed minimum.

## Consequences

**Positive:**
- Every run starts with context — the quality benefit is realized even when
  the agent is passive or hooks aren't wired.
- Checkpoint has two independent paths (agent hooks + kanbots fallback), so a
  gap in one doesn't create a silent memory hole.
- Decision capture (Decision 5) is high-signal content that future runs
  genuinely benefit from, and only kanbots can see it.
- Cost budget is respected: recall is trimmed, not skipped, when budget is
  tight.

**Negative:**
- Two actors writing to memory (agent via hooks/MCP, kanbots via fallback +
  decision capture) means possible duplicate entries. Mitigation: the
  fallback only fires when nothing was written, so duplicates are rare;
  agentmemory's consolidation/decay handles the rest.
- The pre-run REST call to `:3111` adds latency to dispatch startup. Keep
  the timeout short (sub-second) and degrade gracefully (skip the block) if
  the server is slow — consistent with ADR-0002's health-gated dispatch.
- Token-capping the recall block means sometimes the most relevant memory is
  the one trimmed. Acceptable trade-off; the agent can still query via MCP.

**Neutral:**
- The "Relevant project memory" block format should be consistent across
  adapters; document it once and reuse.
- This ADR is the most coupled to the others (depends on 0001–0004). Changes
  to scoping (0004) or wiring (0003) ripple into the recall call here.

## References

- `packages/api/src/agent-runs/supervisor.ts:1032-1041` — `composeSystemPrompt`
  (pre-run injection point)
- `packages/dispatcher/src/adapters/claude-code.ts:19-24` —
  `--append-system-prompt`
- `packages/api/src/agent-runs/supervisor.ts:671-764` — `close` handler,
  terminal status
- `packages/api/src/agent-runs/supervisor.ts:758-762` — `onRunComplete`
  (fallback checkpoint point)
- `packages/dispatcher/src/stream-parser.ts` — `decision` event
- agentmemory REST: `POST /agentmemory/smart-search`, `memory_sessions` —
  ADR-0001 references, `AGENTS.md` upstream
- agentmemory 12 hooks (SessionStart, Stop, PostToolUse, …) — ADR-0001
  references
- ADR-0002 (lifecycle), ADR-0003 (wiring), ADR-0004 (scoping)
