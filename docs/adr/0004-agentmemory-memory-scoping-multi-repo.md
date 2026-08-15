# ADR-0004: agentmemory — memory scoping across repos and agents

- **Status**: Accepted
- **Date**: 2026-08-11
- **Deciders**: fork maintainer
- **Depends on**: ADR-0001, ADR-0002, ADR-0003

## Context

agentmemory has **no native per-repository isolation.** All memories live in
one SQLite store under `~/.agentmemory/data/` (overridable via `--data-dir` /
`AGENTMEMORY_DATA_DIR`). What it *does* offer:

- **Session-ID scoping** — observations are keyed `mem:obs:${sessionId}`.
- **Team namespace** — `mem:team:${teamId}:shared` for cross-agent shared
  memory within a team, plus `mem:team:${teamId}:users:${userId}` for
  per-user-within-team.
- **Global stores** — `mem:memories`, `mem:graph:nodes`, `mem:graph:edges`,
  `mem:summaries` are shared across sessions/teams.
- **Separate instances** — running two `agentmemory` daemons with different
  `--data-dir` gives hard isolation at the cost of a second process, engine,
  and port set.

kanbots, meanwhile, has these natural scopes (confirmed by
`packages/local-store/src/repos/` and `supervisor.ts`):

| kanbots scope | Where it lives | Example |
| --- | --- | --- |
| Conversation / chat session | `chat_sessions` table, pinned provider+model | standalone chat panel |
| Issue thread | `threads` + `messages` tables | one issue's discussion |
| Agent run | `agent_runs` row, one per `claude -p` invocation | a single dispatch |
| Workspace repo | `workspace_repos`, resolved via `repoId` in dispatch | multi-repo workspace |

The hard question: when an agent run on repo A finishes, what should the next
run (on repo A, repo B, or a different issue in repo A) be able to recall?

### Forces

- Too-broad scoping → an agent working on repo B recalls repo A's patterns
  and applies them wrongly. Cross-contamination.
- Too-narrow scoping → no cross-run memory at all, defeating the integration.
  The whole point is continuity.
- Multi-agent (kanbots's 11 CLIs) raises a sub-question: should what Claude
  learned be visible to Codex on the next run? Usually yes — that is a stated
  benefit — but it must be a deliberate choice, not an accident of session-ID
  collision.
- Autopilot's `feature-dev` mode (`docs/agents.md`) splits issues into
  subtasks and runs personas in parallel. Memory scoping has to compose with
  that, not fight it.

## Decision

**Single shared agentmemory instance by default, with repo encoded into the
session namespace. Per-workspace isolation available as an opt-in.**

1. **Default: one instance, repo-scoped sessions.** With the single-instance
   model from ADR-0002, kanbots derives the agentmemory **session ID** for
   each run from a deterministic key:

   ```
   kanbots:<workspaceId>:<repoId>:<issueNumber>:<runId>
   ```

   `memory_recall` calls are prefixed with the repo-scoped namespace
   `kanbots:<workspaceId>:<repoId>` so an agent on repo A recalls repo A's
   prior runs (across issues, across agents, across time), but **not** repo
   B's. This implements per-repo recall on top of agentmemory's session-ID
   mechanism without a second database.

2. **Cross-repo sharing via the team namespace, opt-in.** When the user wants
   an agent on repo B to see repo A's decisions (e.g., shared architectural
   decisions across a monorepo's packages, or a portfolio of microservices
   with shared conventions), they set in `config.json`:

   ```jsonc
   { "memory": { "scope": "team", "teamId": "my-platform" } }
   ```

   kanbots then also reads/writes the
   `mem:team:${teamId}:shared` namespace. `scope: "shared"` (default) means
   repo-scoped-only; `scope: "team"` adds the team layer; `scope: "global"`
   disables namespaping entirely (everything visible everywhere — expert-mode
   footgun, documented as such).

3. **Opt-in hard isolation via per-workspace instance.** For users who want a
   clean break (e.g., a client-work workspace that must never share memory
   with personal projects), ADR-0002's lifecycle allows a per-workspace
   agentmemory instance with a dedicated `--data-dir` under
   `.kanbots/agentmemory-data/`. This is the heaviest option (separate
   process, ports, engine) and is documented as "only when legal or hygienic
   isolation demands it."

4. **Cross-agent visibility is the default within a scope.** Because the
   namespace is keyed by workspace+repo (not by agent CLI), what Claude
   learned on issue #12 is visible to Codex on issue #13 in the same repo.
   This is the stated benefit ("new agent inherits knowledge from the
   previous one") and is on by default. Users who want per-agent isolation
   can add the agent to the session key via an advanced toggle.

5. **No automatic cross-workspace sharing.** Two different kanbots workspaces
   pointing at the same agentmemory instance see disjoint namespaces by
   default (the `workspaceId` prefix). Sharing requires explicit `teamId`
   opt-in.

## Alternatives Considered

### Option A — Per-repo agentmemory instance (one daemon per repo)
Rejected as default. Multiplies processes, ports (3111/3112/3113/49134 × N
repos), and engine downloads. The iii-engine port conflict (`:49134`) makes
running several instances on one host painful. Kept as Option 3 above for the
rare case that demands it.

### Option B — Global namespace, no scoping (everything recalls everything)
Rejected. Predictable cross-contamination: an agent on a brand-new repo would
hallucinate patterns from an unrelated project. The continuity benefit is
real but must be bounded by repo boundaries by default.

### Option C — kanbots-side filtering layer on top of a global store
Considered. Every recall goes through a kanbots shim that filters memories by
repo before returning them to the agent. Rejected for v1: it duplicates
agentmemory's own scoping machinery, adds latency to every recall, and
requires kanbots to understand memory semantics it currently doesn't have.
The session-namespace approach (Decision 1) achieves the same effect using
agentmemory's built-in mechanism.

### Option D — Per-agent isolation by default (Claude's memory ≠ Codex's memory)
Rejected as default. Breaks the cross-agent continuity benefit, which is one
of the main reasons to integrate memory at all. Kept as an advanced toggle.

## Consequences

**Positive:**
- Sensible default: an agent on repo X recalls repo X, nothing else, with
  zero config.
- Cross-agent continuity works automatically within a repo.
- Monorepo / multi-service teams get cross-repo recall through one explicit
  `teamId`, not a re-architecture.
- Hard isolation remains available for compliance scenarios without
  burdening the common case.

**Negative:**
- The session-ID and namespace encoding is a kanbots convention layered on
  agentmemory. If agentmemory changes its namespace scheme upstream, the
  mapping breaks. Mitigation: pin the agentmemory version (ADR-0002 already
  records version awareness) and keep the encoding in one place.
- Deterministic session IDs mean a re-run with the same key *resumes* rather
  than *creates* — need to confirm agentmemory's session semantics match
  kanbots's run identity (each `agent_runs` row gets a fresh `runId`, so
  collisions are avoided, but worth a test).
- The `scope: "global"` footgun exists. Mitigate by warning in the UI when
  it's selected.

**Neutral:**
- `config.json` gains `scope` and optional `teamId` fields (validated by
  `workspace.ts`, unknown keys warned per existing convention).
- ADR-0005 depends on this: the recall call in the prompt-prefix injection
  uses the namespace decided here.

## References

- agentmemory KV namespace scheme — `src/state/schema.ts` upstream
  (`mem:obs:${sessionId}`, `mem:team:${teamId}:shared`, …)
- `packages/local-store/src/repos/chat-sessions.ts:39-65` — session scoping
  precedent
- `packages/api/src/agent-runs/supervisor.ts:977-991` — `repoId` resolution
  on dispatch (source of the repo key)
- `docs/agents.md` — Autopilot feature-dev & personas (memory must compose)
- ADR-0002 (lifecycle), ADR-0003 (wiring)
