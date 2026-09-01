# Adding Codex (OpenAI CLI) as an agent provider

A concrete plan for letting users run agent tasks against OpenAI's `codex` CLI
instead of (or alongside) `claude`.

## Goals & non-goals

**Goals**

- Add `codex-cli` as a selectable provider for agent runs (worktree-based
  task execution), not just chat.
- Reuse the existing supervisor, worktree, containment, decision-card, and
  cost-tracking machinery without forking it.
- Keep the change additive — `claude-code` stays the default and the
  current behavior is unchanged when the user does not opt in.

**Non-goals**

- Resume/session continuation parity. Codex's session model is different;
  resume is best-effort in v1 (see Open questions).
- Full feature parity for decision cards on day one. Decision cards work
  by detecting `kanbots-decision` fenced blocks in assistant text, which
  Codex *can* be steered into producing via system prompt — but we accept
  that some interactive prompts (e.g. Codex's own approval requests) may
  not surface as decision cards in v1.
- Replacing the Anthropic-shaped `StreamEvent` schema. Codex output is
  normalized into the same event union; we do not introduce a second one.

## Where things stand today

The provider abstraction is half-built:

- `packages/dispatcher/src/worker.ts:11-17` defines
  `AgentRunProvider = 'claude-code' | 'anthropic' | 'openai' | 'google' | 'deepseek' | 'xai'`.
- `packages/dispatcher/src/worker.ts:100-105` hard-throws for anything other
  than `claude-code` and unconditionally spawns the literal `claude`
  binary with Anthropic-specific flags (`--output-format stream-json`,
  `--permission-mode bypassPermissions`, `--resume`, `--append-system-prompt`).
- `packages/dispatcher/src/stream-parser.ts` is hard-coded to Anthropic's
  stream-json shape (`assistant` / `user` / `result` / `system` envelope,
  `tool_use` / `tool_result` content blocks).
- DB migration `0014-agent-run-provider.ts` already adds a `provider`
  column to `agent_runs` and defaults rows to `'claude-code'`, so the
  schema can already record per-run provider without changes.
- `packages/api/src/agent-runs/supervisor.ts:645-766` reads
  `input.provider ?? 'claude-code'`, persists it, and threads it into
  `startAgent(...)` for both chat and worktree runs. The supervisor itself
  is provider-agnostic.
- The UI exposes a provider list in
  `packages/web/src/components/modals/ProvidersSettingsModal.tsx` and
  model picking in `ModelPicker.tsx`, but `codex-cli` is not in
  `ProviderId` and Codex models are not in the catalogue.

In short: the supervisor + DB + UI plumbing is ready for a new provider.
The dispatcher is not.

## Provider model

Add a new enum value `codex-cli` rather than reusing `'openai'`. Reasons:

- `'openai'` already exists in `ProviderId` as a chat-only Messages-API
  provider that talks directly to `api.openai.com`. Codex is a *local
  CLI* that exec's `codex` on PATH and runs tools against the worktree —
  a different transport, different credentials path, different error
  modes. Conflating them would force every codepath to branch on "API
  key vs CLI binary" inside a single id.
- The existing `'claude-code'` vs `'anthropic'` split sets the precedent:
  CLI-backed agentic provider on one id, raw API on another.

Result: `ProviderId = ... | 'codex-cli'`, and
`AgentRunProvider = 'claude-code' | 'codex-cli'` (the other values stay
chat-only and continue to throw `UnsupportedProviderForAgentRunError` —
the codex-cli value is the only new agent provider).

## Stream adapter strategy

The dispatcher has one job per run today: spawn a CLI, line-split stdout,
parse each line with `parseStreamLine`, emit normalized `StreamEvent`s.
We keep that pipeline; the adapter swap is at the spawn-and-parse layer.

Introduce a small adapter interface in `packages/dispatcher/src/`:

```ts
export interface AgentCliAdapter {
  command: string;                    // 'claude' | 'codex'
  buildArgs(opts: BuildArgsInput): string[];
  parseLine(line: string): StreamEvent[];
  detectRateLimit?(stderrChunk: string): RateLimitEvent | null;
  /** How to feed the prompt: stdin (claude) vs argv positional (codex). */
  promptDelivery: 'stdin' | 'argv';
}
```

Two implementations:

- `claude-code-adapter.ts` — extracts the current logic from `worker.ts`
  (the args block at `worker.ts:108-130` and the stream-parser as-is).
- `codex-cli-adapter.ts` — new file, see below.

`startAgentRun` becomes a thin shell that picks the adapter from
`opts.provider`, builds args, spawns, line-splits, and routes lines
through `adapter.parseLine`. Stop/escalation, process-group handling,
and the `RunSummary` shape stay identical.

### Codex CLI adapter — concrete shape

Codex CLI's exact flag surface and event schema must be confirmed against
the installed binary before coding (see `Open questions` below). Based on
publicly documented behavior at the time of writing, the adapter looks
roughly like:

- **Command**: `codex` (binary on PATH; configurable via
  `opts.command`, like the claude path is today).
- **Subcommand**: `exec` for non-interactive runs (the analogue of
  `claude -p`).
- **Flags**:
  - `--json` (or whatever flag emits one JSON object per line — confirm).
  - `--cd <opts.cwd>` if Codex doesn't honor the spawn cwd reliably; else
    omit and rely on `spawnOpts.cwd`.
  - Approval-bypass flag analogous to `--permission-mode bypassPermissions`.
    Codex has a "full access" / "danger" mode — pick the closest equivalent
    and gate it behind a feature flag (don't enable silently).
  - `--model <opts.model>` when provided.
  - System prompt: Codex does not have a direct `--append-system-prompt`
    flag. Prepend the composed system prompt to the user prompt with a
    clear delimiter (the same composed prompt the supervisor builds today
    via `composeSystemPrompt`).
- **Prompt delivery**: argv positional, not stdin. Today the worker writes
  `opts.prompt` into stdin (`worker.ts:182-185`); the adapter abstraction
  must let codex-cli pass it as the final argv element instead.
- **Resume**: if Codex exposes a session id and a resume flag, map
  `opts.resumeFromSessionId` to it. If not, log a warning and start a
  fresh session — the supervisor already tolerates `sessionId` being null
  for non-claude-code providers (`supervisor.ts:693-695`).

### Event mapping

The `StreamEvent` union (`stream-parser.ts:3-32`) is the contract every
downstream consumer (UI, persistence, containment, cost) reads. Map
Codex's stream into it:

| Existing event       | Codex source                                                      |
|---|---|
| `text`               | Assistant text deltas / final assistant message                  |
| `tool_use`           | Codex's tool/function call event (id, name, input)               |
| `tool_result`        | Codex's tool result event (`tool_use_id`, content, error flag)   |
| `session`            | Whatever init/start event Codex emits with a session/run id      |
| `result`             | Final summary event — total tokens, duration, exit status        |
| `decision`           | Detected by re-running `extractTextEvents` / `DECISION_BLOCK_RE` over the assistant text — same mechanism as today |
| `rate_limit`         | Codex error events containing 429 / quota / overloaded markers   |
| `parse_error`        | Fallback for unrecognized JSON shapes                            |

Decision cards keep working "for free" if and only if the system prompt
instructs Codex to emit ```kanbots-decision``` fenced blocks in assistant
text. Verify that Codex's fenced-code passthrough preserves the block
intact — the current regex (`stream-parser.ts:256`) is permissive but
expects newline-terminated fences.

If Codex emits `tool_result` content as a structured object rather than
the Anthropic shape, normalize it inside the adapter so that the
containment checker (`containment.ts`) and the renderer don't need to
care which provider produced the event.

### Cost & token usage

`mapResult` (`stream-parser.ts:320-335`) populates `tokenUsage` and
`totalCostUsd`. Codex doesn't ship cost numbers in the same field. The
adapter should:

- Populate `tokenUsage` from whatever input/output token field Codex emits.
- Compute `totalCostUsd` locally using the model's pricing from the
  catalogue (`packages/llm/src/catalogue.ts`). Add per-model pricing
  entries for Codex's supported models when adding them (`gpt-5`,
  `gpt-5-mini`, etc., already exist for the `openai` chat provider —
  reuse the price table; do not duplicate).

This keeps the cost-budget gate in the supervisor (`resolveBudget`,
`costBudgetUsd`) functional with no changes.

### Rate-limit detection

`detectRateLimit` (`stream-parser.ts:147-167`) already pattern-matches on
generic substrings like `429`, `rate_limit_error`, `overloaded`, `quota`.
That regex is fine as-is for Codex stderr; add Codex-specific structured
fields (e.g. `error.code === 'rate_limit_exceeded'`) in the adapter's
`detectRateLimit` and merge with the existing fallback.

## Composer & sentry-analyzer

Two other places spawn `claude`:

- `packages/dispatcher/src/composer.ts:222,241` — issue drafting and
  feature suggestion. Single-shot, structured-JSON output. **Out of scope
  for v1.** Keep using `claude`; Codex's structured-output story is
  different and this isn't on the critical path for "use Codex for agent
  runs". File a follow-up.
- `packages/dispatcher/src/sentry-analyzer.ts:90` — Sentry incident
  triage. Same reasoning: single-shot, not user-driven, leave on Claude.

Document the carve-out in the provider settings UI: "Codex runs agent
tasks. Issue drafting and Sentry analysis still use Claude."

## Credentials

Codex CLI authenticates either via OpenAI API key (env: `OPENAI_API_KEY`)
or its own login flow. The adapter should:

- Read the OpenAI API key from the same store the existing `'openai'`
  chat provider already uses (`provider_config` table; see migration
  `0013-providers.ts`).
- Inject it into `spawnOpts.env` for the codex child process. Do not
  rely on the user's shell env — the desktop app is launched from a GUI
  and won't inherit it.
- If the user has used `codex login` to set up account auth instead, fall
  back to spawning without the key and let codex find its own creds. Add
  a "Use Codex login (no API key)" toggle in the provider settings.

## Concrete file changes

Working list, organized by package. Each item is a leaf change, not a
sub-task.

### `packages/dispatcher`

- New `src/adapters/types.ts` — `AgentCliAdapter` interface.
- New `src/adapters/claude-code.ts` — extract args build + the existing
  `parseStreamLine` re-export. No behavior change.
- New `src/adapters/codex-cli.ts` — args builder, line parser (Codex JSON
  events → `StreamEvent`), rate-limit hook, `promptDelivery: 'argv'`.
- Refactor `src/worker.ts`:
  - Remove the `provider !== 'claude-code'` throw at lines 102-104; gate
    on "no adapter registered" instead.
  - Replace the inline args block (108-130) with `adapter.buildArgs(opts)`.
  - Replace the stdin write (182-185) with a switch on
    `adapter.promptDelivery`.
  - Route `parseStreamLine` calls through `adapter.parseLine`.
  - Keep `UnsupportedProviderForAgentRunError` for the still-unsupported
    chat-only providers (`anthropic`, `openai`, `google`, `deepseek`,
    `xai`).
- Update `src/index.ts` exports to include the adapter types if any
  consumer outside the package needs them (currently none — keep
  internal).
- Tests:
  - Snapshot fixtures of real Codex stdout (capture from a manual run)
    under `tests/fixtures/codex/`.
  - Unit tests for the codex-cli parser covering `text`, `tool_use`,
    `tool_result`, `session`, `result`, error/rate-limit, malformed JSON.
  - End-to-end test that spawns a fake `codex` shim (a node script that
    prints fixture lines) and asserts the supervisor produces the same
    `StreamEvent` sequence.

### `packages/local-store`

- No migration needed — `agent_runs.provider` already exists.
- Add `'codex-cli'` to whatever ProviderId enum/zod schema is reused
  inside the store (search for the type imports — at minimum
  `packages/local-store` re-exports `ProviderId`).

### `packages/llm`

- Add `'codex-cli'` to `ProviderId` in `src/types.ts`.
- New `src/adapters/codex-cli.ts` — minimal adapter implementing the
  one-shot chat method as "throw: use startAgentRun" (mirrors
  `claude-code.ts`). Codex chat through this provider is not supported;
  for chat use the existing `'openai'` provider.
- Register in `src/manager.ts` (the `ADAPTERS` record at
  `manager.ts:18-19`).
- Add Codex models to `src/catalogue.ts` with pricing.

### `packages/api`

- Add `'codex-cli'` to `PROVIDER_ENUM` zod arrays in
  `handlers/agent-actions.ts:21`, `handlers/chat.ts:38`,
  `handlers/issues.ts:68/83/102` (every place that lists provider ids).
- Update `bridge.ts`:
  - `ProviderId` union at line 156 — add `'codex-cli'`.
  - Any descriptions / payload shapes that enumerate providers.
- Supervisor (`agent-runs/supervisor.ts`): no logic change. The
  `provider` field is already pass-through. Verify by reading
  lines 645-766 — there's no `if provider === 'claude-code'` branch.
- Tests: extend the supervisor tests to cover one happy-path codex run
  with a fake adapter.

### `packages/web`

- `src/types.ts` re-exports `ProviderId` — picks up the new value
  automatically once the api package is updated.
- `components/modals/ProvidersSettingsModal.tsx`:
  - Add a `ProviderSpec` entry for `codex-cli` (`SPECS` array,
    lines 23-61).
  - Add Codex models to `MODELS_BY_PROVIDER` (lines 64-92). Mirror the
    `@kanbots/llm` catalogue — same models as the existing `openai`
    chat provider entry, since Codex runs them.
  - Add a "Use Codex login (no API key)" checkbox if we support that
    auth path.
- `components/forms/ModelPicker.tsx` — no change; it iterates providers
  generically.
- `components/modals/TaskCreateModal.tsx` — no change; provider/model
  is opaque to it.
- A small disclaimer in the modal next to the codex entry: "Requires
  `codex` on PATH. Issue drafting and Sentry analysis still run on Claude."

### `packages/desktop`

- No change. The Electron shell is provider-agnostic.

## Phasing

- **Phase 1 — adapter scaffolding (no Codex yet).** Extract the claude
  args/parse code into `claude-code-adapter.ts`. Refactor `worker.ts` to
  delegate. Land with no behavior change. This is the one risky refactor;
  doing it alone makes review easy.
- **Phase 2 — codex-cli adapter.** Add the new adapter, fixtures, parser
  tests. Wire `'codex-cli'` through the type system end-to-end. Gate the
  UI behind a hidden flag (don't show in the modal yet).
- **Phase 3 — UI exposure & docs.** Surface in `ProvidersSettingsModal`,
  add the carve-out copy, write a short user-facing doc explaining what
  Codex does and doesn't run, ship.

## Open questions (resolve before Phase 2)

These need a manual session with the actual `codex` binary on the dev
machine. Do not start Phase 2 before answering them — guesses here
compound into rewrites later.

1. Exact subcommand and flags for non-interactive, machine-readable
   output. (`codex exec --json`? `codex run --jsonl`? Something else?)
2. Schema of each event type Codex emits — capture ~10 minutes of real
   stdout/stderr from a representative task and check it in as a fixture.
3. Whether Codex emits a stable session/run id and, if so, whether it
   has a resume flag. Determines whether `resumeChat` /
   `resumeFromSessionId` work for codex runs.
4. Approval / sandbox model. Does Codex have a "full access" mode that
   runs without per-tool prompts? If not, decision cards may not be
   sufficient and we need to either pre-approve or surface Codex's own
   approval UI (likely out of scope for v1 — gate the provider behind
   an "experimental" badge).
5. Tool naming. Decisions and containment use the tool name string
   (`Bash`, `Edit`, `Write`, etc.). Codex tool names are different; the
   containment checker (`packages/dispatcher/src/containment.ts`) likely
   needs a per-provider tool-name allowlist or a normalization layer.
6. Cost reporting. Confirm whether Codex emits per-run cost or just
   tokens. Drives whether `totalCostUsd` is direct or computed from the
   catalogue.

## Risks

- **Decision cards may degrade silently.** The `kanbots-decision` block
  detection runs on assistant text. If Codex reformats fenced code (e.g.
  unwraps it, prepends a language hint, splits across deltas), the regex
  will miss it. Mitigation: parse-test the fixture early; if it doesn't
  survive the round-trip, add a streaming-aware detector that buffers
  partial fences across `text` events.
- **Containment.** `containment.ts` matches paths from tool inputs. If
  Codex passes paths in a different shape (relative vs absolute,
  different field names), the worktree-escape detector will under- or
  over-fire. Mitigation: normalize to Claude's tool-input shape inside
  the adapter, not in the containment module.
- **Process-group kill.** The detached-process / `process.kill(-pid, ...)`
  trick at `worker.ts:217-219` assumes the CLI itself doesn't fork
  workers in unusual ways. Codex is a Rust binary; verify on Linux that
  `SIGTERM` to the pgid actually stops in-flight tool invocations and
  doesn't orphan a sandbox process.
- **Stop-escalation latency.** If Codex's graceful shutdown is slower
  than 10s (`DEFAULT_GRACEFUL_TIMEOUT_MS` in `worker.ts:97`), users will
  see SIGKILL escalations more often. Make the timeout per-provider
  configurable; default Codex to 20s.
- **User confusion about "openai" vs "codex-cli".** Two openai-flavored
  entries in the provider list will confuse people. Mitigation: copy
  needs to be explicit — "OpenAI API (chat only)" vs "Codex CLI (agent
  runs, requires `codex` binary)". Consider greying out `'openai'` for
  agent run contexts in the picker.

## Done when

- `pnpm desktop:dev` lets a user pick `codex-cli` in the provider
  settings, configure credentials, start a worktree-based agent run from
  an issue, and watch tool calls / text / final result stream into the
  agent panel without errors.
- The same run, killed mid-flight via the Stop button, terminates within
  the graceful window without leaking processes.
- Cost budget enforcement works against a Codex run (kill the run when
  it crosses the threshold).
- All existing claude-code runs behave identically — no regressions in
  the snapshot fixtures, supervisor tests, or stream-parser tests.
