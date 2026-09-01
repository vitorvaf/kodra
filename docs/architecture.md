# Architecture

A map of how the pieces fit together. Read this if you're contributing,
debugging an obscure issue, or wiring kanbots into something else.

## Process model

```
┌─────────────────────────────────────────────────────────────────┐
│                       Electron main process                      │
│                                                                  │
│  ┌────────────┐     ┌──────────────┐     ┌────────────────────┐ │
│  │ Workspace  │     │ IPC bridge   │     │ Agent supervisor   │ │
│  │ picker     │ ──► │ (api/bridge) │ ◄── │ (api + dispatcher) │ │
│  └────────────┘     └──────────────┘     └─────────┬──────────┘ │
│                                                    │             │
│  ┌────────────┐     ┌──────────────┐               │ spawns      │
│  │ Tool bridge│     │ better-sqlite3│              ▼             │
│  │ (HTTP)     │     │ (.kanbots/db) │     ┌────────────────────┐ │
│  └─────┬──────┘     └──────────────┘     │ claude -p          │ │
└────────┼─────────────────────────────────┘ (one per run)      │ │
         │                                  └────────────────────┘ │
         ▼                                                          │
   ┌──────────────────┐                                             │
   │ kanbots-mcp-     │   Renderer (Electron BrowserWindow)         │
   │ server (stdio)   │   ┌───────────────────────────────────┐    │
   └──────────────────┘   │  React + Vite UI (@kanbots/web)   │    │
        ▲                 │                                    │    │
        │ stdio           │  window.kanbots.invoke / subscribe │    │
        ▼                 └───────────────────────────────────┘    │
   ┌──────────────────┐                                             │
   │ MCP client       │                                             │
   │ (Cursor, Claude) │                                             │
   └──────────────────┘                                             │
```

There is **no HTTP server** for the renderer — every renderer→main call
goes over Electron IPC. The HTTP tool bridge is local-only and exists
purely to bridge the MCP server (which lives in its own stdio process)
back to the in-Electron handler library.

## Package layout

```
packages/
├── core/         # domain types, GitHub client, IssueSource contract
├── local-store/  # SQLite, migrations, repos, LocalIssueSource, workspace
├── llm/          # provider catalogue, OpenAI-compat adapters, manager
├── dispatcher/   # agent runtime: spawn claude, parse stream, worktrees
├── api/          # pure handler library, agent supervisor, tool bridge
├── mcp/          # kanbots-mcp-server bin
├── web/          # React + Vite UI
└── desktop/      # Electron shell, IPC registration, packaging
```

### Dependency graph

```
core
  ├──► local-store (uses core types, IssueSource contract)
  ├──► dispatcher (no direct dep, but shares types via api)
  └──► api

local-store
  ├──► api
  └──► llm

dispatcher
  ├──► api
  └──► llm

llm
  └──► api

api
  ├──► desktop
  ├──► mcp
  └──► web (type-only via bridge.ts)

web
  └──► desktop (bundled into Electron)
```

`@kanbots/api` is the central hub: handlers, the agent supervisor, the
HTTP tool bridge, and the type definitions for every IPC channel
(`bridge.ts`).

## IPC bridge

`packages/api/src/bridge.ts` declares every channel the renderer can
call. The desktop side registers handlers with `ipcMain.handle()` under
the prefix `kanbots:invoke:`. The renderer accesses them via:

```ts
window.kanbots.invoke('issues:list', { state: 'open' })
window.kanbots.subscribe('agent-runs:events', (payload) => { ... })
```

Channels grouped by purpose:

| Group | Channels |
| --- | --- |
| Workspace | `config:get`, `workspace:get`, `workspace:get-budgets`, `workspace:set-budgets` |
| Issues | `issues:{list,get,create,patch,add-comment,changed}` |
| Cards | `cards:{list,resolve}` |
| Agent runs | `issues:dispatch`, `agent-runs:{stop,diff,stats,reveal-worktree,promote-commit,promote-pr,events:subscribe}` |
| Checks | `agent-runs:checks:{list,run,commands}` |
| Preview | `agent-runs:preview:{get,start,stop}` |
| Providers | `providers:{get,save,test-connection,set-defaults}` |
| Sentry | `sentry:{get-config,save-config,test-connection,sync-now,analyze}` |
| Autopilot | `autopilot:{start,stop,list-active,get-by-issue}` |
| Chat | `chat:{list,create,get,delete,post-message}` |
| Cooldown | `cooldown:{get,changed}` |

The full source of truth is `bridge.ts` — the type imports there list
every payload shape.

## Database

SQLite via `better-sqlite3`, one file at `.kanbots/db.sqlite`. Schema
is built up by numbered migrations:

```
packages/local-store/src/migrations/
├── 0001_initial.ts
├── 0002_..., 0003_..., …
└── 0019_project_scope.ts        # latest
```

Migrations run on store open. They're idempotent — each migration
records its number in `schema_migrations` and skips if already applied.

Key tables:

| Table | Purpose |
| --- | --- |
| `local_issues` | Issues for local-mode workspaces. |
| `cards` | UI state for an issue (status, agent state, decision payload). |
| `threads` | Per-issue conversation thread root. |
| `messages` | Messages within a thread. |
| `agent_runs` | One row per `claude -p` invocation. |
| `agent_events` | Streamed events (text, tool_use, tool_result, decision, result). |
| `autopilot_sessions` | Autopilot orchestration state. |
| `providers` | Provider configs + encrypted API keys. |
| `chat_conversations` | Standalone chat sessions (not tied to issues). |
| `sentry_config`, `sentry_imports` | Sentry integration. |
| `promotions` | Audit trail for worktree → branch promotions. |
| `sync_state` | Per-table sync metadata for the future cloud edition. |

A few tables (`cloud_account`, `sync_state`) are stubs from migration
`0019_project_scope` — they're empty in the local edition.

## Renderer

`@kanbots/web` is React 19 + Vite 6, bundled into the Electron app at
build time. Entry: `packages/web/src/main.tsx`. Pages:

| Page | What it is |
| --- | --- |
| `WorkspacePicker.tsx` | First-run picker, recent workspaces. |
| `Board.tsx` | The main kanban board. |
| `ChatApp.tsx` | Standalone chat sessions. |
| `ProvidersOverlay.tsx` | Gate when no provider is configured. |
| `ClaudeLoginGate.tsx` | Gate when `claude` isn't signed in. |

State lives mostly in component-local hooks (`useBoardFilters`,
`useAgentRunStream`, etc.). There's no Redux / Zustand store —
everything that needs to persist goes through IPC into SQLite.

DnD is handled by `@dnd-kit/core` (`DndContext`, `DragOverlay`).

## Agent CLI integration

The dispatcher spawns either `claude -p` or `codex exec` as a detached
child process and parses its stdout NDJSON stream. CLI-specific
behaviour (argument construction, stream parsing, decision plumbing)
sits behind a single `AgentCliAdapter` interface so the rest of the
runtime is agent-agnostic. See
[agents.md → What runs](agents.md#what-runs).

Worktrees are managed via `git worktree add` / `git worktree remove`,
wrapped in `packages/dispatcher/src/worktree.ts`. A `pre-push` hook is
written into each worktree's `.git/hooks/` (the worktree-local hooks
dir) to block agent-driven pushes.

## Tool bridge (for MCP)

A small Express-style HTTP server inside the Electron main process,
bound to `127.0.0.1` on a random port. It exposes the same handler set
as the IPC bridge, gated by a bearer token.

The MCP server (`@kanbots/mcp`, run as a separate stdio process) calls
`POST /tool/<name>` with the args, and the bridge dispatches to the
in-process handlers.

This indirection exists because the MCP server has to live outside
Electron (clients spawn it themselves) but the handlers it wants to
call are tightly coupled to better-sqlite3 connections that live in
the desktop process.

See [mcp-server.md](mcp-server.md) for the wiring.

## Build

`pnpm build` runs every package's `build` script (`tsup` for
TypeScript packages, `vite build` for the web package). The desktop
package's build pipeline is:

1. `pnpm build:web` — Vite → `packages/web/dist`
2. `pnpm build:main` — tsup → `packages/desktop/dist/main.cjs`
3. `pnpm copy:web` — copy `packages/web/dist` into desktop dist
4. `pnpm ensure:native` — rebuild better-sqlite3 against Electron's ABI

`pnpm desktop:dev` runs Vite + tsup --watch + electronmon concurrently
for HMR development.

`pnpm package` runs electron-builder for the host platform. Platform-specific
recipes (`package:linux`, `package:mac`, `package:win`) cover AppImage + tar.xz
on Linux, dmg + zip (arm64 + x64) on macOS, and an NSIS installer on Windows.
Cross-host packaging is not supported because `ensure:native` fetches the
better-sqlite3 prebuild for the host's platform/arch.
