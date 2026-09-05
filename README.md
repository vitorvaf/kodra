<p align="left"><img src="docs/assets/brand/kodra-icon-256.png" alt="Kodra" width="96" height="96"></p>

# Kodra

> **Agentic development workspace.**

A kanban board that runs 12 agent CLIs in parallel.
Claude Code, Codex, Gemini, Antigravity, Cursor, Copilot, Amp, OpenCode,
Droid, CCR, Qwen, plus any ACP-compatible CLI. Drop a folder. Get a board.
Dispatch agents on every card — at the same time, each in its own
worktree. Or hit autopilot and let them split tasks, run them in
parallel slots, and check their own work while you sleep.

![Kodra board overview](docs/assets/board-overview.png)

## Highlights

- **Kanban with five columns** (Backlog → Done) plus an Inbox for
  unlabeled cards. Drag to move; in GitHub mode the move is mirrored
  as `status:*` label edits.
- **Local-first issues** by default — stored in SQLite. Switch to
  GitHub mode to drive real issues on a repo. Local issues can carry
  custom alphanumeric ids (`FEAT-42`) and group into folders.
- **Agent memory** — spawned agents can carry a persistent,
  workspace-scoped memory server over MCP, so context survives across
  runs. Configure what gets recalled in Memory settings.
- **12 agent CLIs supported** — Claude Code, Codex, Gemini, Antigravity,
  Cursor, Copilot, Amp, OpenCode, Droid, CCR, Qwen, plus any ACP-compatible
  CLI. Each run is isolated in a per-run worktree; a pre-push hook
  prevents agents from pushing.
- **Live agent thread** — every `tool_use`/`tool_result` streams in.
  Decision prompts pop into the UI; click an option, the run
  continues.
- **Live checks & fork runs** — check badges update on cards in real
  time while runs execute, and a follow-up run can fork into an
  existing worktree to iterate on its state.
- **Session resume** — every run surfaces its agent session id and a
  ready-to-paste terminal resume command in the task detail modal.
- **Auto-update** — packaged builds update themselves in-app; releases
  are cut by a tag-driven multi-OS pipeline.
- **Subscription awareness** — plan usage for Claude, Codex,
  Antigravity and Copilot is surfaced in the UI, so you can spread
  work across the plans you already pay for.
- **Branch preview** — start the worktree's dev server in one click
  and open a live URL.
- **Promote** — land an agent's worktree as a real commit, or open a
  draft PR (GitHub mode).
- **Sentry import** — auto-pull error groups onto the board for
  triage; one click hands the issue to an agent.
- **MCP server** — `kodra-mcp-server` exposes the board over Model
  Context Protocol so Cursor, Claude Desktop, or anything MCP-aware
  can drive it (`kanbots-mcp-server` remains as a legacy alias).

## Supported agents

Pick the CLI per dispatch from the New Task modal. Each one reuses
its own auth (you don't sign into Kodra — Kodra calls the CLI
that's already on your `PATH`).

| Provider | CLI binary | Sign-in |
| --- | --- | --- |
| Claude Code | `claude` | `claude /login` |
| Codex | `codex` | `codex login` or `OPENAI_API_KEY` |
| Gemini | `gemini` | `gemini auth` |
| Antigravity CLI | `agy` | browser OAuth on first launch |
| Cursor CLI | `cursor-agent` | `cursor-agent login` |
| GitHub Copilot CLI | `gh-copilot` | `gh auth login` (needs Copilot subscription) |
| Amp | `amp` | `amp login` |
| OpenCode | `opencode` | `opencode auth` |
| Droid | `droid` | `droid auth` (Factory account) |
| CCR (Claude Code Router) | `ccr` | reuses Claude Code auth + routes to alternative models |
| Qwen Code | `qwen` | `qwen auth` |
| **Any ACP-compatible CLI** | (your binary) | per CLI — Kodra speaks the Agent Client Protocol over stdio |

Install the ones you want on your `PATH`. You only need at least one.

## Getting started

### Run from source (fork; primary path)

```sh
git clone https://github.com/vitorvaf/kodra.git
cd kodra
pnpm install
pnpm desktop          # build everything, open Electron
# or, for hot-reload:
pnpm desktop:dev      # Vite + tsup --watch + electronmon
```

You'll need **Node 20+**, **pnpm 10+**, **git**, and at least one of
the supported agent CLIs on your `PATH` (see [Supported
agents](#supported-agents) above — `claude`, `codex`, `gemini`, `agy`,
`cursor-agent`, etc.). Add `gh` + `gh auth login` if you'll be
driving GitHub issues.

Running under WSL? Hardware acceleration is disabled automatically to
avoid GPU compositing artifacts — set `KODRA_FORCE_GPU=1` to override.

### Upstream Kanbots distribution (npx)

The published `kanbots` package and its packaged binaries are the upstream
Kanbots distribution, not Kodra:

```sh
npx kanbots
```

On first run, the right binary downloads automatically (~80MB) from the
[upstream releases page](https://github.com/leodavinci1/kanbots/releases),
and the app opens.

To upgrade later: `npx kanbots@latest`.

macOS arm64/x64 and Linux x64 are fully automated. On Windows, the npx
launcher points you at the `.exe` installer for v1 — see
[`npx-cli/README.md`](npx-cli/README.md).

### Upstream Kanbots packaged builds

Latest upstream binaries: [releases page](https://github.com/leodavinci1/kanbots/releases).

**macOS** — builds are currently unsigned, so Gatekeeper rejects the
.dmg on first launch with *"kanbots is damaged and can't be opened"*.
Use the one-line install script — it grabs the right .dmg for your
architecture, clears the quarantine flag, and copies the app into
`/Applications`:

```sh
curl -fsSL https://kanbots.dev/install-mac.sh | bash
```

If you'd rather install by hand: download the .dmg, drag the app
into `/Applications`, then run
`xattr -d com.apple.quarantine /Applications/kanbots.app` once.

**Linux** — `.AppImage` (`chmod +x` and run) or `.tar.xz`.

**Windows** — `.exe` installer. SmartScreen warns on first launch —
*More info → Run anyway*. Like macOS, the build is unsigned.

### Kodra packaged builds

Packaged builds are cut by a tag-driven pipeline: the `release-cut`
workflow bumps the version and pushes a `v*` tag, and `release-build`
builds macOS (dmg/zip, arm64 + x64), Linux (AppImage/tar.xz) and
Windows (NSIS installer) in parallel and publishes the GitHub release.
Packaged installs self-update from those releases. The first release
has not been cut yet — when it lands, binaries appear on the
[fork releases page](https://github.com/vitorvaf/kodra/releases).

### First run

A workspace picker opens. Pick any folder that contains a git
repository — Kodra creates `.kodra/` (db + config + worktrees)
inside it and drops you on the board.

Full walkthrough: [docs/getting-started.md](docs/getting-started.md).

## Workspace data directory

New workspaces use `.kodra/`. Existing workspaces keep `.kanbots/` so their
database and configuration continue to work. Both directories are added to
`.gitignore` automatically. The layout below applies to either name:

```
.kodra/ (or .kanbots/)
├── db.sqlite        # all issues, threads, runs, providers, settings
├── config.json      # workspace mode + defaults (see docs/configuration.md)
├── worktrees/       # one subdir per agent run
├── attachments/     # files dragged into chats / cards
├── mcp-runtime/     # transient MCP configs handed to claude / codex
├── specs/           # approved /spec outputs, one per issue
└── promote/         # staging area when promoting a worktree to a commit
```

Nothing is written outside this directory or the worktrees it creates.

## Workspace modes

| Mode | Source of issues | Use it for |
| --- | --- | --- |
| `local` | SQLite in the workspace data directory | Solo work, side projects, anywhere you don't want GitHub Issues |
| `github` | GitHub REST via Octokit | When the repo's issues already live on GitHub |

See [docs/issues.md](docs/issues.md) for auth setup and the
`IssueSource` contract.

## How an agent run works

1. Click **Dispatch** on a card.
2. Kodra creates `.kodra/worktrees/issue-<n>-<runId>/` for new runs, branched
   from the repo's default branch.
3. It spawns `claude -p` (or `codex` exec mode) against that worktree
   with stream-JSON output, parses every event, and forwards it to the
   UI.
4. If the agent requests a decision, the run pauses and a card pops
   up. You answer it; the run continues.
5. When the run finishes (or you stop it), the worktree stays on disk:
   - **Branch preview** — start its dev server.
   - **Promote commit** — land it on your real branch.
   - **Open draft PR** — GitHub mode only.
   - **Fork run** — dispatch a follow-up agent run into this worktree.
   - **Discard** — remove worktree + branch.

A pre-push hook is installed in every worktree so agents can't push
to remote on their own. Promotion is always an explicit user step.

![Task detail modal](docs/assets/task-detail-overview.png)

*Issue detail: description, Thread/Diff/Preview/Runs tabs, branch
info, and the agent-session block with a ready-to-paste terminal
resume command.*

Details: [docs/agents.md](docs/agents.md).

## Autopilot

Autopilot turns dispatch from a one-shot click into a loop.

- **`feature-dev`** — Multi-persona, parallel slots (up to 4). Round-robin
  through your persona roster on the parent issue; agents split into
  subtasks as they go. Ideation runs through the session's own provider
  CLI (any of the 11 — each uses its own login), not just claude.
  Stops on completion, stop button, or session cost budget, and fails
  fast with a root-cause reason after 5 consecutive failed
  ideate/dispatch iterations instead of retrying forever.
- **`qa`** — Runs configurable check commands
  (`typecheck` / `tests` / `lint` / `build` / `e2e`), optionally
  starts a dev server and watches it, and dispatches fix runs against
  whatever fails.

Both write to `autopilot_sessions` so you can watch the cycle history,
see every child run, and stop the whole tree from a single button.

Details: [docs/agents.md#autopilot](docs/agents.md#autopilot).

## Documentation

| Topic | What's there |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install, first run, picking a workspace |
| [Agents](docs/agents.md) | All 12 agent CLI runs, decision prompts, containment, costs, autopilot, personas |
| [Providers](docs/providers.md) | AI providers modal — picking the agent CLI, API key storage |
| [Issues](docs/issues.md) | Local mode, GitHub mode, auth, Sentry import |
| [MCP server](docs/mcp-server.md) | Wiring `kodra-mcp-server` into Cursor or Claude Desktop |
| [Configuration](docs/configuration.md) | `.kodra/config.json`, env vars, check command overrides |
| [Architecture](docs/architecture.md) | Packages, IPC bridge, database, dependency graph |
| [Architecture decisions](docs/adr/README.md) | ADRs — agent memory integration, RTK output compression |
| [Rebranding notes](docs/rebranding.md) | Compatibility identifiers and migration debt |
| [Releasing](docs/releasing.md) | Cutting releases — version bump, tags, multi-OS builds, auto-update |

## Packages

| Package | Purpose |
| --- | --- |
| [`@kanbots/core`](packages/core) | Domain types, GitHub client, `IssueSource` contract |
| [`@kanbots/local-store`](packages/local-store) | SQLite schema, migrations, repos, `LocalIssueSource` |
| [`@kanbots/dispatcher`](packages/dispatcher) | Agent runtime — spawns the configured agent CLI, parses its stream output, manages worktrees |
| [`@kanbots/llm`](packages/llm) | CLI adapters and provider catalogue |
| [`@kanbots/api`](packages/api) | Pure handler library + agent supervisor (no HTTP server) |
| [`@kanbots/mcp`](packages/mcp) | MCP server (`kodra-mcp-server` recommended; `kanbots-mcp-server` legacy alias) |
| [`@kanbots/web`](packages/web) | React + Vite UI |
| [`@kanbots/desktop`](packages/desktop) | Electron shell, IPC bridge, workspace picker |

## Origins

Kodra is a fork of [Kanbots](https://github.com/leodavinci1/kanbots) by
Leonardo Cunha, rebranded and adapted. The original MIT license and
attribution are retained — see [LICENSE](LICENSE).

See [Rebranding notes](docs/rebranding.md) for the preserved compatibility
identifiers, pending screenshots, and other migration debt.

## License

MIT — see [LICENSE](LICENSE).
