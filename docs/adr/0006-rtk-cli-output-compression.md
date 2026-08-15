# ADR-0006: RTK — CLI output compression for spawned agents

- **Status**: Accepted
- **Date**: 2026-08-11
- **Deciders**: fork maintainer
- **Depends on**: ADR-0001

## Context

RTK (`rtk-ai/rtk`, ~75.8k★, Apache-2.0, "Rust Token Killer") is a single Rust
binary that intercepts verbose CLI output and compresses it before an agent
reads it. `git status` becomes "3 files, +10 -2"; `cargo test` becomes
"2 failed, 18 ok". It ships 64 command filter modules across ecosystems (git,
cargo, go, npm/pnpm, pytest, rspec, docker, kubectl, playwright, …), preserves
underlying exit codes, and falls back to raw output if filtering fails.

Integration model: `rtk init -g` installs a `PreToolUse` hook into the
agent's config that transparently rewrites `git status` → `rtk git status` at
the boundary, with zero per-command context overhead. It supports 16 AI tools
natively (Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode,
Droid, and others — overlapping heavily with kanbots's 11).

What RTK is **not** (per ADR-0001): not an agent framework, not an MCP server,
not a memory system. Its only effect is reducing the byte/token volume of
command output that reaches the agent's context window.

### Why this matters to kanbots

kanbots tracks per-run and per-session USD cost (`runCostBudgetUsd`,
`sessionCostBudgetUsd` in `.kanbots/config.json`; accumulated from the
`result` event's cost field per `docs/agents.md`). Agent runs inside worktrees
generate a lot of shell output — build, test, lint, git — that the agent reads
back. RTK shrinks that share, giving cost budgets more headroom and letting
autopilot sessions run longer before hitting the cap. The relevance is purely
to the cost axis established in ADR-0001; there is no quality/memory effect.

### Forces

- RTK's hook lives in the **user's agent config** (`~/.claude/settings.json`
  etc.), not per-worktree. A spawned agent reads that config (unless kanbots
  overrides it with explicit `--mcp-config` / settings flags — see ADR-0003),
  so in the common case RTK is *already active* for kanbots-spawned agents
  once the user has run `rtk init -g`.
- The transparent-rewrite surface area is non-zero: a command RTK doesn't
  handle well, or a filter that drops a signal the agent needed, can cause
  subtle misbehavior. RTK falls back to raw output on filter failure, but
  "successful but misleading" compression is possible.
- RTK estimates tokens as `bytes / 4` with no tokenizer; the savings numbers
  are reliable ratios but approximate absolutes.
- Name collision: `reachingforthejack/rtk` ("Rust Type Kit") is an unrelated
  crate. Users must verify with `rtk gain`.

## Decision

**Document-only integration for v1: instruct users to install RTK globally
themselves. No kanbots code, no per-worktree manipulation, no auto-install.**

1. **A new docs page, `docs/rtk.md`.** Explains what RTK is, that it's
   optional, the cost-budget rationale, and the one-command install
   (`curl … install.sh | sh` then `rtk init -g`). Mirrors the tone of
   `docs/mcp-server.md` (here's what it does, here's how to wire it, here's
   how to verify).

2. **Detection, not management.** On startup, kanbots checks whether `rtk` is
   on `PATH` (and is the *right* rtk — see the name-collision note). If
   present, the UI shows "RTK: active" in Settings; if absent, nothing — no
   nag, no prompt. This is informational parity with ADR-0002's
   agentmemory detection, not a dependency.

3. **No automatic hook injection by kanbots.** kanbots does **not** write RTK
   hooks into worktrees, agent configs, or `.kanbots/`. The user's global
   `rtk init -g` handles it. Rationale: RTK's design is transparent
   user-side rewriting; replicating that machinery inside kanbots duplicates
   upstream for no gain and risks divergence.

4. **A `config.json` flag for the cost-budget-aware UI only.** Optional:

   ```jsonc
   { "rtk": { "assumeInstalled": true } }
   ```

   When set, the cost-budget UI annotates projected savings ("budget
   conservatively assumes RTK; without it, expect ~N% more command-output
   cost"). This is presentation-only; kanbots does not invoke RTK.

5. **Revisit if isolation demands it.** If a future use case requires
   per-worktree RTK control (e.g., a workspace where RTK must be off for
   fidelity), this ADR is superseded by one that adds managed wiring. That is
   not needed today.

## Alternatives Considered

### Option A — kanbots auto-installs RTK and runs `rtk init` per agent
Rejected. (a) RTK's hook is global by design; per-agent injection fights the
grain. (b) Forces an external binary download on every kanbots install. (c)
The user can already do this in one command; automating it saves little and
adds maintenance. (d) Silent command rewriting inside spawned agents is the
kind of magic that's hard to debug when it goes wrong — better the user opts
in explicitly.

### Option B — kanbots wraps commands itself (`rtk <cmd>` at the spawn layer)
Rejected. The agent, not kanbots, decides which shell commands to run inside
the worktree. kanbots only spawns the top-level agent process; it doesn't see
the agent's internal `Bash` tool calls (those appear as `tool_use`/`tool_result`
events but are not re-invokable by kanbots). Wrapping at the kanbots layer
would require intercepting and re-executing every `tool_use` — a deep change
to the dispatcher with no benefit over RTK's own PreToolUse hook.

### Option C — Per-worktree `.claude/settings.json` with the RTK hook
Considered for isolation scenarios. Rejected for v1: agents spawned by
kanbots read the user's global config in the common case, so a per-worktree
override is redundant unless we *also* want to disable RTK in some
worktrees — which is Option-A territory and not needed yet.

### Option D — Out of scope entirely (don't even document)
Rejected. RTK is a real cost win for exactly the workload kanbots generates
(agent runs full of build/test/git output), and the user has explicitly
asked for it in scope (ADR-0001). Documenting it costs almost nothing and
makes the cost-optimization axis of the fork real.

## Consequences

**Positive:**
- Zero kanbots code changes for v1 — lowest-effort integration of all six
  component ADRs.
- Users who want it install it once; users who don't are unaffected.
- The cost-budget feature gets a documented lever for stretching budgets
  without kanbots taking on maintenance of an external binary.
- Clean upgrade path: when/if RTK adds kanbots-native hook support upstream,
  kanbots adopts it with no rewrite.

**Negative:**
- The benefit is only realized for users who read the docs and install RTK
  themselves. Users who don't will see no cost improvement and may not know
  why.
- RTK's transparent rewriting can mask output the agent needed; diagnosing
  "the agent misread a test failure because RTK compressed it" requires the
  user to know RTK is in the path. Mitigation: the `docs/rtk.md` page calls
  this out explicitly with a "how to disable for one run" note
  (`rtk proxy` or temporarily removing the hook).
- kanbots can't measure the actual savings (RTK stores its own analytics in
  `~/.local/share/rtk/history.db`, separate from kanbots). The
  `assumeInstalled` flag is a hint, not a measurement.

**Neutral:**
- Adds one docs page (`docs/rtk.md`) and one optional `config.json` flag.
- The detection check is a `which rtk` + `rtk --version` on startup; cheap,
   non-blocking, fails silently.
- Independent of ADRs 0002–0005 (agentmemory). Can be done first, last, or
  never without affecting the memory work.

## References

- RTK README — https://github.com/rtk-ai/rtk/blob/develop/README.md
- RTK INSTALL — https://github.com/rtk-ai/rtk/blob/develop/INSTALL.md
- RTK ARCHITECTURE — https://github.com/rtk-ai/rtk/blob/develop/docs/contributing/ARCHITECTURE.md
- RTK savings explanation —
  https://github.com/rtk-ai/rtk/blob/develop/docs/guide/resources/savings-explained.md
- `docs/configuration.md` — `runCostBudgetUsd` / `sessionCostBudgetUsd`
- `docs/agents.md` — cost accumulation from the `result` event
- ADR-0001 (rtk is the cost axis, orthogonal to agentmemory)
