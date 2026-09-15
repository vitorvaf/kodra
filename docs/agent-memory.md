# Agent memory (AgentMemory)

Development agents working on this repository (OpenCode, Claude Code, Kodra's
own runs) can share a persistent project memory backed by
[AgentMemory](https://github.com/rohitg00/agentmemory). The server is
**external infrastructure**: it runs in a Docker container with its own
volume, and this repository only talks to it over MCP and its HTTP API. The
repo never reads AgentMemory's database, files or `/data` volume.

## Architecture

```text
Developer machine

┌──────────────────────────────────────────────┐
│ Repository (kodra)                           │
│                                              │
│  OpenCode / Claude Code ──MCP (stdio shim)──┐│
│                                             ││
│  Kodra app ── MemoryProvider ──HTTP /agentmemory/* ──┐
│               (packages/api/src/memory)     ││       │
└─────────────────────────────────────────────┼┼───────┼──┘
                                              ▼▼       ▼
┌──────────────────────────────────────────────────────────┐
│ kodra-agentmemory container  (127.0.0.1:3111)            │
│ @agentmemory/agentmemory 0.9.29 + iii-engine 0.11.2      │
│ volume agentmemory_data:/data                            │
└──────────────────────────────────────────────────────────┘
```

Two independent paths, on purpose:

- **Agent ↔ AgentMemory over MCP.** The `@agentmemory/mcp` shim exposes
  `memory_save`, `memory_recall`, `memory_smart_search`, `memory_team_share`,
  `memory_team_feed`, `memory_governance_delete`, … directly to the agent.
  Nothing in this repo sits in the middle.
- **Application ↔ AgentMemory over HTTP.** The Kodra app injects a compact
  recall block into dispatched runs and records run checkpoints and resolved
  decisions. It does so through one seam, `MemoryProvider`.

## Running AgentMemory locally

There is no pre-built AgentMemory Docker image. `docker/agentmemory/Dockerfile`
is the upstream deploy template (Apache-2.0): it installs the pinned npm
package and copies the pinned `iiidev/iii` engine binary in. Data lives in the
named volume `agentmemory_data`, mounted at `/data`.

```sh
cp .env.example .env         # fill AGENTMEMORY_* (never commit .env)
pnpm memory:start            # docker compose -f docker-compose.agentmemory.yml up -d --build
pnpm memory:logs             # first boot prints AGENTMEMORY_SECRET once if you left it empty
pnpm memory:health           # livez + auth check → exit 0 healthy, 1 unavailable, 2 secret rejected
pnpm memory:stop
```

Only port `3111` is published, on loopback. The stream (`3112`) and the
viewer (`3113`) stay inside the container. If you need the viewer, use
`docker exec` or an SSH-style tunnel; do not publish it.

Secret handling: set `AGENTMEMORY_SECRET` in `.env` and the container uses it.
Leave it empty and the entrypoint generates one on first boot, prints it once
in the logs and persists it in `/data/.hmac`. Every client (MCP shim, app,
`memory:health`) must then send it as `Authorization: Bearer <secret>`.

## Environment variables

All values come from the environment (or `.env` for compose and `.env.local`
for `pnpm desktop:dev`). Nothing is hardcoded. See `.env.example`.

| Variable                        | Default                 | Meaning                                                                                                           |
| ------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `AGENTMEMORY_ENABLED`           | `false`                 | Turns the in-app `MemoryProvider` on. `false` → `NoopMemoryProvider`; the app behaves as if memory did not exist. |
| `AGENTMEMORY_URL`               | `http://localhost:3111` | Server URL.                                                                                                       |
| `AGENTMEMORY_SECRET`            | _(empty)_               | Bearer secret. Also passed to the container as its `AGENTMEMORY_SECRET`.                                          |
| `AGENTMEMORY_PROJECT`           | repo folder name        | Canonical project id sent as AgentMemory's `project`. Use the same value in every agent.                          |
| `AGENTMEMORY_TEAM_ID`           | _(empty)_               | Team id. Mapped to the server's `TEAM_ID`. Team sharing works only when `TEAM_ID` and `USER_ID` are both set.     |
| `AGENTMEMORY_USER_ID`           | _(empty)_               | Developer id. Mapped to the server's `USER_ID`; tagged as `user:<id>` on writes.                                  |
| `AGENTMEMORY_AGENT_ID`          | _(empty)_               | Writing agent (`opencode`, `claude-code`, `kodra`). Mapped to `AGENT_ID` and sent as `agentId` per request.       |
| `AGENTMEMORY_MODE`              | `private`               | `private` or `shared`; mapped to the server's `TEAM_MODE`.                                                        |
| `AGENTMEMORY_TIMEOUT_MS`        | `2000`                  | Per-request timeout. Memory never blocks a task longer than this.                                                 |
| `AGENTMEMORY_MAX_CONTEXT_ITEMS` | `10`                    | Max recalled items injected into a prompt.                                                                        |
| `AGENTMEMORY_MAX_CONTEXT_CHARS` | `8000`                  | Max characters of the recalled block.                                                                             |
| `AGENTMEMORY_HEALTH_CACHE_MS`   | `30000`                 | How long a health probe is trusted (no probe per operation).                                                      |

Precedence in the app, highest first: environment variables, then the
`memory` section of `.kodra/config.json`, then defaults. The Settings → Memory
toggle still writes `config.json`; an explicit `AGENTMEMORY_ENABLED` wins over it.

## Connecting OpenCode (and other MCP clients)

`opencode.json` at the repo root registers the shim under OpenCode's
top-level `mcp` key, the same shape `agentmemory connect opencode` writes to
`~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "agentmemory": {
      "type": "local",
      "command": ["npx", "-y", "@agentmemory/mcp"],
      "enabled": true,
      "environment": { "AGENTMEMORY_URL": "http://localhost:3111" }
    }
  }
}
```

The shim reads `AGENTMEMORY_URL` and `AGENTMEMORY_SECRET` from its
environment. Export the secret in the shell that launches OpenCode (or add it
to your user-level `opencode.json`); it is deliberately not in the committed
file. `AGENTS.md` tells the agent when to recall, when to remember and how to
promote a memory to the team.

Claude Code picks up the same server from `.mcp.json` (`${AGENTMEMORY_URL}`
and `${AGENTMEMORY_SECRET}` are expanded from the environment).

When the server is unreachable the shim falls back to a 7-tool local mode.
That is not a shared memory: run `pnpm memory:health` and check
`AGENTMEMORY_URL` when you see only 7 tools.

## Private vs team memory

AgentMemory keeps two stores:

- **Private memory** — everything written with `memory_save` or
  `POST /agentmemory/remember`. Searchable with `memory_recall` /
  `smart-search`, filtered by `project`. This is where discoveries land.
- **Team memory** — the shared feed under `mem:team:<TEAM_ID>:shared`. Items
  get there only through `POST /agentmemory/team/share` (`memory_team_share`)
  and are read with `GET /agentmemory/team/feed` (`memory_team_feed`).

The flow is deliberate: **discovery → private memory → validation → team
memory**. Nothing is promoted automatically. A note like "I am investigating an
inconsistent ACK" stays private; "the endpoint can return a duplicated ACK,
consumers must be idempotent" is promoted once confirmed.

Identity on every write (used for ranking and provenance):

| Concept    | Where it lives in AgentMemory                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| project    | `project` field on memories, sessions, lessons                                                                |
| team       | server env `TEAM_ID`; `team:<id>` concept tag                                                                 |
| user       | server env `USER_ID` (`sharedBy` on team items); `user:<id>` concept tag                                      |
| agent      | `agentId` per request; `agent:<id>` concept tag                                                               |
| source     | `source:<code\|developer\|pr\|adr\|issue\|agent>` concept tag                                                 |
| scope      | private store vs team feed; `scope:private` tag on app writes                                                 |
| kind       | AgentMemory `type` (architecture, bug, pattern, workflow, preference, fact) plus `kind:<conceptual kind>` tag |
| confidence | `confidence:<hypothesis\|observation\|confirmed>` tag; lessons use the numeric `confidence` field             |

AgentMemory has no per-request team/user fields in v0.9.29, so those two are
per **server instance**. The concept tags carry the attribution when several
developers share one server.

## The application layer

`packages/api/src/memory/`:

| File                 | Role                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `config.ts`          | `resolveMemoryConfig(env, workspace)` — the only place env vars are read.                                      |
| `provider.ts`        | `MemoryProvider` interface, `NoopMemoryProvider`, `AgentMemoryProvider`, `createMemoryProvider`.               |
| `context-builder.ts` | Ranks recalled items (team → score → recency) and caps the prompt block.                                       |
| `redaction.ts`       | Refuses to store content that looks like a credential.                                                         |
| `client.ts`          | Thin HTTP client for `/agentmemory/*` (existing; extended with `remember`, `forget`, `teamShare`, `teamFeed`). |
| `session-bridge.ts`  | Session start/observe/end for runs and chats (existing).                                                       |

```ts
interface MemoryProvider {
  remember(input: RememberInput): Promise<RememberResult>; // private memory, returns memoryId
  recall(input: RecallInput): Promise<MemoryRecord[]>; // team feed first, then private hits
  share(memoryId: string): Promise<boolean>; // private → team
  forget(memoryId: string): Promise<boolean>;
  health(): Promise<boolean>;
  status(): Promise<'disabled' | 'healthy' | 'unavailable'>;
  recallContext(input: RecallInput): Promise<string | null>; // recall + bounded prompt block
}
```

Call sites: run dispatch (`recallMemoryBlock` in the supervisor), run
completion checkpoints, resolved decision cards, and chat session recovery.
Everything is best-effort: an unavailable server logs
`[memory] unavailable url=… — continuing without memory` once and every
operation degrades to an empty or failed result. `remember` is never retried
because AgentMemory has no idempotency key.

### Examples

```ts
import { createMemoryProvider, resolveMemoryConfig } from '@kanbots/api';

const memory = createMemoryProvider({
  getConfig: () => resolveMemoryConfig({ env: process.env }),
});

// remember (private)
const saved = await memory.remember({
  content: 'The supplier can send a duplicated ACK. Consumers must be idempotent.',
  kind: 'integration_behavior',
  confidence: 'confirmed',
  source: 'developer',
  provenance: { repository: 'kodra', branch: 'main' },
});
// → { ok: true, memoryId: 'mem_…', scope: 'private' }

// recall
const hits = await memory.recall({ query: 'duplicated ACK' });
const block = await memory.recallContext({ query: 'já investigamos ACK duplicado?' });

// promote to the team after validation
await memory.share(saved.memoryId!);
```

From an agent over MCP the same three steps are `memory_save` →
`memory_smart_search` → `memory_team_share`.

Equivalent raw HTTP calls (all with `Authorization: Bearer <secret>`):

```sh
curl -X POST $AGENTMEMORY_URL/agentmemory/remember \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $AGENTMEMORY_SECRET" \
  -d '{"content":"The supplier can send a duplicated ACK…","type":"fact","project":"kodra","concepts":["kind:integration_behavior","source:developer"]}'

curl -X POST $AGENTMEMORY_URL/agentmemory/smart-search \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $AGENTMEMORY_SECRET" \
  -d '{"query":"duplicated ACK","project":"kodra","limit":5}'

curl -X POST $AGENTMEMORY_URL/agentmemory/team/share \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $AGENTMEMORY_SECRET" \
  -d '{"itemId":"mem_…","itemType":"memory","project":"kodra"}'
```

## Disabling

- App: `AGENTMEMORY_ENABLED=false` (or leave it unset and keep the Settings →
  Memory toggle off). The `NoopMemoryProvider` answers every call.
- OpenCode: set `"enabled": false` on the `agentmemory` entry in
  `opencode.json`, or stop the container. The shim then falls back to its
  local mode; remove the entry to disable memory tools entirely.

## Staleness

Memory is a hint, not the truth. Recalled blocks start with a reminder that
the current code wins over an old memory. AgentMemory supersedes near-identical
memories on write (`version`, `supersedes`, `isLatest`) and can expire
temporary ones (`ttlDays`; the app sets 7 days for `temporary_context`). There
is no explicit "deprecate" endpoint in v0.9.29: to retire a memory, write a
newer one stating what changed, or delete it with `memory_governance_delete`
when it is plain wrong.

## Troubleshooting

| Symptom                                                                           | Check                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose up` → "Bind for 127.0.0.1:3111 failed: port is already allocated" | Another AgentMemory (e.g. from a different project) already owns 3111. Either reuse it (point `AGENTMEMORY_URL`/secret at it; one server can hold several `project`s) or set `AGENTMEMORY_PORT=3121` and `AGENTMEMORY_URL=http://localhost:3121` in `.env`. |
| `pnpm memory:health` → unavailable                                                | `docker compose -f docker-compose.agentmemory.yml ps`; first boot pulls `iiidev/iii` and builds.                                                                                                                                                            |
| `memory:health` → secret rejected                                                 | `AGENTMEMORY_SECRET` differs from the container's (see `pnpm memory:logs` first boot line).                                                                                                                                                                 |
| OpenCode shows only 7 memory tools                                                | Shim could not reach `AGENTMEMORY_URL`; server down or secret missing in the OpenCode env.                                                                                                                                                                  |
| `memory_team_share` → "Team memory not enabled"                                   | `AGENTMEMORY_TEAM_ID` and `AGENTMEMORY_USER_ID` must both be set **before** the container starts.                                                                                                                                                           |
| App logs `[memory] unavailable`                                                   | Expected when the server is down; the app keeps working. Start the container and it recovers.                                                                                                                                                               |
| Nothing is recalled                                                               | Same `AGENTMEMORY_PROJECT` on every writer? Recall filters by `project`.                                                                                                                                                                                    |

## Limitations (v0.9.29)

- Team and user identity are server-wide (`TEAM_ID`/`USER_ID` env), not per
  request. Several developers sharing one server share one `USER_ID` on the
  server side; the `user:<id>` tag on each memory keeps attribution.
- No idempotency key, so the app never retries writes.
- No deprecate/supersede endpoint beyond the automatic near-duplicate
  supersession on write.
- Team feed is a recency list, not a search; the provider filters it by
  project and by query keywords before ranking it first.
- The `@agentmemory/mcp` shim only reads `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET`;
  project, team and agent ids must be passed by the agent (see `AGENTS.md`).
