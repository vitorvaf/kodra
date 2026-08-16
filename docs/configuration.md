# Configuration

Reference for `.kanbots/config.json` and the environment variables Kodra
reads at startup. Most users never edit the file by hand — the desktop UI
covers all of it — but knowing the schema is useful for scripting or for
checking it into a project template.

## `.kanbots/config.json`

Two shapes, one per workspace mode. Both share a common
`WorkspaceConfigCommon` extension.

### Local mode

```jsonc
{
  "mode": "local",
  "name": "my-side-project",
  "authorLogin": "leo",

  // optional
  "defaults": {
    "runCostBudgetUsd": 2.5,
    "sessionCostBudgetUsd": 25
  },
  "notifyOnRunComplete": true,
  "checks": {
    "typecheck": { "command": "pnpm", "args": ["typecheck"] },
    "tests":     { "command": "pnpm", "args": ["test"] },
    "lint":      { "command": "pnpm", "args": ["lint"] },
    "e2e":       { "command": "pnpm", "args": ["e2e"] }
  }
}
```

### GitHub mode

```jsonc
{
  "mode": "github",
  "owner": "vitorvaf",
  "repo": "kanbots",

  // same optional fields as local mode
  "defaults": { ... },
  "notifyOnRunComplete": true,
  "checks": { ... }
}
```

## Field reference

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `mode` | `'local' \| 'github'` | required | Issue source. |
| `name` | `string` | required (local) | Display name. |
| `authorLogin` | `string` | required (local) | Used as issue/comment author. |
| `owner` | `string` | required (github) | GitHub repo owner. |
| `repo` | `string` | required (github) | GitHub repo name. |
| `defaults.runCostBudgetUsd` | `number \| null` | `null` | Per-run USD cap; `null` disables. |
| `defaults.sessionCostBudgetUsd` | `number \| null` | `null` | Per-autopilot-session USD cap. |
| `notifyOnRunComplete` | `boolean` | `false` | Show OS notification when a run ends. |
| `checks.<kind>.command` | `string` | — | Override the executable for a check kind. |
| `checks.<kind>.args` | `string[]` | — | Args to that executable. |
| `memory.enabled` | `boolean` | `false` | Enable the AgentMemory integration; an absent `memory` section remains unset. |
| `memory.provider` | `'agentmemory'` | `'agentmemory'` | Memory provider; only AgentMemory is supported. |
| `memory.url` | `string` | `http://localhost:3111` | AgentMemory service URL. |
| `memory.secret` | `string \| null` | `null` | Optional AgentMemory authentication secret. |
| `memory.scope` | `'shared' \| 'team' \| 'global'` | `'shared'` | Memory namespace scope. |
| `memory.teamId` | `string \| null` | `null` | Team identifier; required for `team` scope. |
| `rtk.assumeInstalled` | `boolean` | `false` | Skip RTK installation checks when true. |

`<kind>` is one of `typecheck`, `tests`, `lint`, `e2e`.

## Cost budgets

Two separate caps, both optional, both denominated in USD as reported
by Claude's `result` events.

- **`runCostBudgetUsd`** — applies to every individual agent run. When
  exceeded, the dispatcher stops the run with `stopReason: 'cost-budget'`.
- **`sessionCostBudgetUsd`** — applies to autopilot sessions. The session
  stops; in-flight children finish their current iteration but no new
  child runs are started.

Both can be set via the **Settings → Cost budgets** UI, or directly in
`config.json`. Setting either to `null` (or omitting it) means "no cap".

## Check command overrides

Autopilot QA sessions and the **Run checks** action need to know how to
invoke your typecheck / test / lint / e2e commands. Defaults are
detected from `package.json` scripts, but you can override per-workspace:

```json
{
  "checks": {
    "typecheck": { "command": "tsc", "args": ["--noEmit"] },
    "tests":     { "command": "vitest", "args": ["run"] },
    "lint":      { "command": "eslint", "args": ["."] },
    "e2e":       { "command": "playwright", "args": ["test"] }
  }
}
```

Unknown keys are ignored with a warning. Each entry must have a
non-empty `command` and a `string[]` `args`.

## Memory

The optional `memory` section configures the AgentMemory service used to
provide persistent agent memory. Its defaults keep a local service at
`http://localhost:3111` in the `shared` scope. Set `scope` to `team` only
when `teamId` is provided; `global` uses the global namespace. See
[ADR-0003](adr/0003-agentmemory-mcp-wiring-into-spawned-agents.md) for the design and rollout details.

## RTK

The optional `rtk` section controls the repository tool kit integration.
Set `assumeInstalled` to `true` when RTK is already installed and Kodra
should not require an installation check. See [ADR-0006](adr/0006-rtk-cli-output-compression.md)
for the design details.

## Containment mode

Optional, top-level:

```json
{ "containmentMode": "warn" }
```

Values: `off`, `warn` (default), `pause`. See
[agents.md → Containment](agents.md#containment) for what each does.

Can also be set via `KANBOTS_CONTAINMENT_MODE` environment variable.

## Environment variables

Kodra reads the following at startup. Most are dev-only.

| Var | Used by | Meaning |
| --- | --- | --- |
| `GITHUB_TOKEN` | GitHub mode | Fallback when `gh auth token` fails. |
| `KANBOTS_CONTAINMENT_MODE` | dispatcher | Override `containmentMode` for this process. |
| `KANBOTS_RENDERER_URL` | desktop dev | Tell Electron to load Vite at this URL instead of `dist/`. |
| `KANBOTS_OPEN_DEVTOOLS` | desktop | Open Chromium devtools on launch (`1`/`true`). |
| `KANBOTS_TOOL_BRIDGE_URL` | MCP server | Where to reach the desktop's tool bridge. |
| `KANBOTS_TOOL_BRIDGE_TOKEN` | MCP server | Bearer token for the tool bridge. |

The legacy provider-key vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`, `XAI_API_KEY`) are **only**
consulted on first run for one-time import into the providers table —
not at runtime.

## File locations

```
~/.kanbots/token           # global GitHub token fallback (3rd in priority)
<repo>/.kanbots/config.json
<repo>/.kanbots/db.sqlite
<repo>/.kanbots/worktrees/issue-<n>-<runId>/
<repo>/.kanbots/mcp-runtime/mcp-<uuid>.json    # transient
```

Anything in `<repo>/.kanbots/` is created and managed by the app. The
file under `~/.kanbots/` is the only thing Kodra ever writes to your
home directory, and only if you put it there yourself.

## Validation

`packages/local-store/src/workspace.ts` exposes `readWorkspaceConfig()`
which validates the JSON shape, drops unknown check kinds, and returns
`null` if the file is malformed. Bad fields are warned to the console
but don't crash the app — Kodra falls back to defaults so a typo
doesn't lock you out.
