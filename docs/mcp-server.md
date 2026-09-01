# MCP server

`@kanbots/mcp` ships a standalone executable, `kanbots-mcp-server`, that
exposes a workspace's board as Model Context Protocol tools. Other MCP
clients — Cursor, Claude Desktop, the Claude Code CLI itself — can use
it to read issues, dispatch runs, or resolve decisions on your behalf.

> The desktop app does **not** need the MCP server to function. This is
> for letting external clients drive kanbots.

## How it works

The desktop app (or any host that imports `@kanbots/api`) runs a small
HTTP **tool bridge** on `127.0.0.1`. The MCP server is a thin stdio
process: it receives tool calls from its client, forwards them to the
bridge over HTTP with a token, and streams back the response.

```
┌────────────┐  stdio   ┌─────────────────┐  HTTP   ┌──────────────────┐
│ MCP client │ ───────► │ kanbots-mcp-    │ ──────► │ kanbots tool     │
│ (Cursor…)  │ ◄─────── │ server          │ ◄────── │ bridge (Electron)│
└────────────┘          └─────────────────┘         └──────────────────┘
```

Two environment variables wire it up:

| Var | Value |
| --- | --- |
| `KANBOTS_TOOL_BRIDGE_URL` | `http://127.0.0.1:<port>` — the bridge URL printed by the desktop app |
| `KANBOTS_TOOL_BRIDGE_TOKEN` | A bearer token — rotated per Electron session |

You'll find the current values under **Settings → MCP server** in the
desktop UI; click **Copy config snippet** to get a ready-made client
entry.

## Tools exposed

Issue CRUD:

- `listIssues` — `state: 'open' | 'closed' | 'all'`
- `getIssue` — `number`
- `createIssue` — `title`, optional `body`, `labels`
- `updateIssue` — `number`, partial fields
- `moveIssueStatus` — `number`, `status` (one of the five status keys)
- `archiveIssue` — `number`
- `splitIssue` — `number`, `children: [{ title, body }]`

Agent runs:

- `dispatchAgent` — `issueNumber`, optional `model`, `personaId`
- `stopAgentRun` — `runId`
- `listAgentRuns` — optional filters
- `listPendingDecisions` — for any blocked runs
- `resolvePendingDecision` — `runId`, `value`

Each tool's input is validated with a JSON schema declared in
`packages/mcp/src/index.ts`. Outputs are pure JSON — no streaming.

## Wiring it into Cursor

Cursor reads MCP server configs from
`~/.cursor/mcp.json`. Add an entry:

```json
{
  "mcpServers": {
    "kanbots": {
      "command": "kanbots-mcp-server",
      "env": {
        "KANBOTS_TOOL_BRIDGE_URL": "http://127.0.0.1:34567",
        "KANBOTS_TOOL_BRIDGE_TOKEN": "<paste from Settings → MCP server>"
      }
    }
  }
}
```

If `kanbots-mcp-server` isn't on your `PATH`, replace `command` with
the absolute path printed by `pnpm -F @kanbots/mcp exec which
kanbots-mcp-server` (or run it via `node /path/to/dist/server.js`).

## Wiring it into Claude Desktop

Claude Desktop's config lives at:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Same shape as Cursor:

```json
{
  "mcpServers": {
    "kanbots": {
      "command": "kanbots-mcp-server",
      "env": {
        "KANBOTS_TOOL_BRIDGE_URL": "http://127.0.0.1:34567",
        "KANBOTS_TOOL_BRIDGE_TOKEN": "..."
      }
    }
  }
}
```

Restart Claude Desktop after editing.

## Wiring it into the Claude Code CLI

The Claude Code CLI accepts a `--mcp-config` file. kanbots already uses
this internally for chat sessions, but you can pass your own:

```sh
claude --mcp-config ~/kanbots-mcp.json -p "list open issues"
```

```json
// ~/kanbots-mcp.json
{
  "mcpServers": {
    "kanbots": {
      "command": "kanbots-mcp-server",
      "env": {
        "KANBOTS_TOOL_BRIDGE_URL": "http://127.0.0.1:34567",
        "KANBOTS_TOOL_BRIDGE_TOKEN": "..."
      }
    }
  }
}
```

## Security

- The bridge listens only on `127.0.0.1` — no LAN exposure.
- A new bearer token is generated each time the desktop app starts.
  Old configs stop working after a restart; copy a fresh snippet.
- The token authorises **everything** the bridge can do (creating
  issues, dispatching agents). Treat it like a session secret —
  don't paste it into untrusted clients or store it in shared dotfiles.

## Files of interest

- `packages/mcp/src/server.ts` — stdio entry, tool registration
- `packages/mcp/src/index.ts` — `KANBOTS_TOOLS` definitions
- `packages/api/src/tool-bridge.ts` — the HTTP shim
