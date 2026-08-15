# ADR-0002: agentmemory — server lifecycle management

- **Status**: Accepted
- **Date**: 2026-08-11
- **Deciders**: fork maintainer
- **Depends on**: ADR-0001

## Context

agentmemory is a long-running local daemon, not a library. Before any spawned
agent can reach it, the server must already be listening on `:3111`
(`@agentmemory/mcp` is a stdio shim that proxies to `localhost:3111` at agent
launch time). The server also:

- Auto-downloads and pins **iii-engine v0.11.2** to `~/.agentmemory/bin/`,
  refusing to attach if another iii engine is already bound to `:49134`.
- Stores everything under `~/.agentmemory/data/` by default (overridable via
  `--data-dir` / `AGENTMEMORY_DATA_DIR`).
- Exposes four ports: `3111` REST, `3112` stream, `3113` web viewer, `49134`
  engine WebSocket.
- Requires Node `>=20`. No external DB, no cloud account.

kanbots already manages long-running local processes: the in-Electron tool
bridge (`packages/api/src/tool-bridge.ts`, bound to `127.0.0.1` on a random
port, token-gated) and worktree lifecycles. So there is precedent for
managed local services. The question is whether agentmemory — heavier, with
its own engine, its own ports, and its own upgrade cycle — should be managed
the same way, or treated as external infrastructure the user provides.

### Forces

- If kanbots assumes the server is up but it isn't, every dispatched run
  silently loses memory until the user notices. Failure is quiet.
- If kanbots *forces* the server to be up by starting it itself, agentmemory
  becomes a hard runtime dependency of the fork, with the footprint and
  failure modes of an external process.
- The iii-engine port conflict (`:49134`) means a user already running
  agentmemory standalone (e.g., for their own Cursor/Claude Desktop) will
  collide with a kanbots-managed instance.
- agentmemory's `connect` flow writes to the **user's** agent config files
  (e.g., `~/.claude/settings.json`); kanbots's spawned agents may not read
  those paths (see ADR-0003). Lifecycle ownership and config ownership are
  separate concerns but interact.

## Decision

**Hybrid lifecycle: kanbots detects, optionally manages, never forces.**

1. **Detection on startup.** The desktop main process pings
   `http://localhost:3111/agentmemory/health` (or the documented liveness
   endpoint) on launch and when the user opens the memory panel. Result is
   surfaced in the UI: a clear "agentmemory: running on :3111" or
   "not running" status.

2. **Optional managed start.** A Settings toggle, default **off**:
   "Start agentmemory with kanbots." When on, kanbots spawns the
   `agentmemory` binary as a supervised child of the Electron main process
   (same detached-process-group pattern used for agent runs), stores its PID,
   logs its stdout/stderr to `.kanbots/logs/agentmemory.log`, and stops it on
   app quit. When off, kanbots assumes the user runs it.

3. **Port-conflict-aware startup.** If the managed start hits the
   iii-engine conflict (`:49134` taken) or a bound `:3111`, kanbots does
   **not** kill the existing process. It treats detection as success
   ("already running — managed start skipped") and records the incident in the
   log. Killing a user's standalone instance would be the worst kind of
   surprise.

4. **Health-gated dispatch.** When memory features are enabled for a run but
   the server is unreachable, dispatch proceeds with a warning event in the
   thread (`agent-runs:events`) rather than failing. Memory is an enhancement,
   not a precondition for a run.

5. **Version pin awareness.** kanbots records the agentmemory version and
   iii-engine version it sees at detection time in `.kanbots/db.sqlite` (a
   small `external_services` row or similar). If a known-bad version is
   detected, the UI warns; it does not block.

## Alternatives Considered

### Option A — kanbots-managed always (force-start on app launch)
Rejected. Makes agentmemory a hard dependency, breaks for users who run it
standalone (port conflict), and forces an external binary + engine download
on every kanbots install. Too coercive for an "enhancement."

### Option B — External always (user's responsibility, kanbots only connects)
Considered. Simplest for kanbots, but the quiet-failure mode is bad: a user
enables memory, dispatches a run, and gets no recall with no visible reason
until they think to check. Detection + UI status mitigates this without
forcing management.

### Option C — Managed per-workspace (separate `--data-dir` per kanbots workspace)
Tempting because it ties lifecycle to the workspace (start when opened, stop
when closed) and gives natural per-repo isolation (see ADR-0004). Rejected as
the *default* because: (a) spinning a server per workspace multiplies port
consumption and engine downloads; (b) the user loses the cross-workspace
memory sharing that is one of agentmemory's strengths. Kept as an opt-in mode
inside ADR-0004, not here.

### Option D — Embed agentmemory as a library inside the Electron process
Rejected. agentmemory is architected as a server with its own engine process,
not an in-process library. Forcing it in-process would mean vendoring and
re-shaping its internals — exactly the kind of integration that breaks on
every upstream release.

## Consequences

**Positive:**
- Existing agentmemory users (who already run it for Cursor/Claude Desktop)
  can point kanbots at their instance with zero duplicate footprint.
- Users who want the integrated experience flip one toggle.
- Quiet failure is avoided: detection + warning event means the user always
  knows *why* a run didn't recall.
- No port-conflict violence; coexistence with standalone agentmemory is
  first-class.

**Negative:**
- Two code paths (managed vs. external) to test and maintain.
- Detection adds a startup HTTP call; needs a short timeout and graceful
  offline behavior.
- The managed path re-uses the agent-run supervisor's process-management
  primitives but agentmemory is long-lived, not a run — different lifecycle,
  worth a small dedicated supervisor rather than overloading the existing one.

**Neutral:**
- A `.kanbots/logs/agentmemory.log` becomes part of the workspace footprint.
- A future cloud edition of kanbots would revisit this (agentmemory-as-service
  in the cloud); that decision is out of scope here.

## References

- agentmemory ports & engine pinning — ADR-0001 references,
  `INSTALL_FOR_AGENTS.md`
- `packages/api/src/tool-bridge.ts` (existing local HTTP service precedent)
- `packages/desktop/src/main.ts` (process supervision; agent-run spawn)
- `packages/api/src/agent-runs/supervisor.ts:671-764` (close/event handling
  pattern to mirror for the agentmemory supervisor)
- `docs/configuration.md:115-126` (existing env-var wiring precedent)
