import { randomUUID } from 'node:crypto';

import type { CloudClient } from '@kanbots/cloud-client';
import {
  createWorktree,
  startAgentRun,
  type AgentRunProvider,
  type StreamEvent,
} from '@kanbots/dispatcher';

/**
 * Cloud-mode agent run dispatcher. Mirrors what the local supervisor does,
 * but persists run state to the cloud API instead of local SQLite:
 *
 *   1. POST /orgs/:slug/projects/:slug/cards/:n/runs  → creates a pending run
 *   2. POST /agent/runs/:id/claim                     → marks claimed
 *   3. create an isolated git worktree at
 *      .kanbots/worktrees/issue-<N>-<R>/ (R = cloud run id) so the agent
 *      doesn't trample on whatever's in the user's main checkout, and
 *      the FileChangeViewer can attribute touched files back to a task
 *   4. spawn the user's local Claude/Codex CLI in that worktree
 *   5. for each parsed StreamEvent, batch + POST /agent/runs/:id/events
 *   6. when the CLI exits, drain the buffer and (if no terminal event was
 *      emitted by the parser) post a synthetic `result` event so the cloud
 *      transitions the run row. The worktree is intentionally left in
 *      place — the user reviews / merges / discards it via the Worktrees
 *      rail section.
 *
 * Event flush strategy: flush every 50 events or every 500 ms (whichever
 * trips first) so the cloud-side board sees progress quickly without
 * one-POST-per-event overhead. Errors during flush are logged but don't
 * abort the run — partial event loss is preferable to killing an
 * in-progress agent.
 */

const FLUSH_BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 500;

/**
 * Bounded retry backoff for the buffer flush — per `sync-04`. We keep
 * the batch in memory (the buffer is re-prepended on failure) and let
 * the schedule loop call us again. Across `MAX_FLUSH_ATTEMPTS` failed
 * attempts in a row we stop trying — the next successful event flush
 * starts a fresh attempt counter.
 *
 * No on-disk spool yet (the spec's NDJSON spool at
 * `~/.kanbots-agent/spool/<run_id>/events.ndjson` is tracked as a
 * follow-up): an in-memory ring caps loss to whatever the process
 * holds when it crashes, which is the same envelope as the
 * surrounding subprocess state.
 */
const MAX_FLUSH_ATTEMPTS = 6;
const FLUSH_BACKOFF_BASE_MS = 250;
const FLUSH_BACKOFF_MAX_MS = 15_000;
/** Cap on in-memory buffer size so a long network outage doesn't OOM. */
const MAX_BUFFERED_EVENTS = 5_000;

const PROVIDER_TO_CLI: Record<
  AgentRunProvider,
  | 'claude_code'
  | 'codex'
  | 'gemini'
  | 'amp'
  | 'cursor'
  | 'copilot'
  | 'opencode'
  | 'droid'
  | 'ccr'
  | 'qwen'
  | 'acp'
> = {
  'claude-code': 'claude_code',
  'codex-cli': 'codex',
  'gemini-cli': 'gemini',
  'amp-cli': 'amp',
  'cursor-cli': 'cursor',
  'copilot-cli': 'copilot',
  'opencode-cli': 'opencode',
  'droid-cli': 'droid',
  'ccr-cli': 'ccr',
  'qwen-cli': 'qwen',
  acp: 'acp',
};
const PROVIDER_TO_PROVIDER_TAG: Record<AgentRunProvider, string> = {
  'claude-code': 'anthropic',
  'codex-cli': 'openai',
  'gemini-cli': 'google',
  'amp-cli': 'sourcegraph',
  'cursor-cli': 'cursor',
  'copilot-cli': 'github',
  'opencode-cli': 'opencode',
  'droid-cli': 'factory',
  'ccr-cli': 'router',
  'qwen-cli': 'alibaba',
  acp: 'acp',
};

/**
 * Cloud run ids are KSUIDs (26 chars). Using the full id keeps the
 * mapping injective but makes the worktree path noisy. Use the last 10
 * chars — KSUIDs have a time prefix, so the tail carries the random
 * uniqueness component and collisions across a single user's worktrees
 * are vanishingly unlikely.
 */
function worktreeSuffixForRun(runId: string): string {
  return runId.slice(-10);
}

function worktreePathFor(repoRoot: string, cardNumber: number, runId: string): string {
  return `${repoRoot}/.kanbots/worktrees/issue-${cardNumber}-${worktreeSuffixForRun(runId)}`;
}

function branchNameFor(cardNumber: number, runId: string): string {
  return `kanbots/issue-${cardNumber}-${worktreeSuffixForRun(runId)}`;
}

export interface DispatchCloudRunOptions {
  cloudClient: CloudClient;
  orgSlug: string;
  projectSlug: string;
  cardNumber: number;
  prompt: string;
  appendSystemPrompt?: string;
  model?: string;
  provider?: AgentRunProvider;
  /** Local repo root the CLI runs inside. Must exist. */
  cwd: string;
  /** Optional sink for stream events (e.g. forward to renderer). */
  onEvent?: (event: StreamEvent) => void;
  /**
   * Optional sink for Edit/Write/MultiEdit tool calls, used to drive the
   * live "file touched" badge in the workspace tree. The dispatcher
   * supplies the worktree path so callers don't have to know it.
   */
  onFileTouched?: (payload: { filePath: string; worktreePath: string }) => void;
}

export interface CloudRunHandle {
  runId: string;
  /** Absolute path of the per-run worktree the CLI is running in. */
  worktreePath: string;
  /** Resolves once the CLI process exits and the final flush completes. */
  done: Promise<CloudRunSummary>;
  /** Stop the CLI gracefully. */
  stop(): void;
}

export interface CloudRunSummary {
  runId: string;
  worktreePath: string;
  /** Final status reported by the cloud after terminal event landed. */
  status: string;
  exitCode: number | null;
}

interface BufferedEvent {
  type: string;
  payload: Record<string, unknown>;
  /**
   * Optional client-generated UUID for cross-batch dedup. The cloud's
   * idempotency-key header already covers same-batch retries; this
   * provides finer-grained per-event dedup for future row-level work
   * (see `sync-05`).
   */
  id?: string;
}

/**
 * Map a local-parser StreamEvent to the wire shape the cloud's
 * /agent/runs/:id/events endpoint accepts.
 *
 * Per `sync-03`, the cloud's per-`type` Zod schemas in
 * `_jsonb-events.ts` declare snake_case field names (`tool_use_id`,
 * `is_error`, `tokens_input`, ...). The local stream-parser uses
 * camelCase (`toolUseId`, `isError`, ...). This function translates
 * each discriminated-union arm explicitly rather than spreading the
 * raw `rest` of the event, so a future field rename in either schema
 * fails loudly at the type level instead of silently producing an
 * invalid payload that the cloud's NDJSON validator throws into
 * `bad_lines`.
 *
 * `diff_hunk` isn't in the cloud's accepted-types whitelist (it's a
 * local-renderer affordance derived from `tool_use`), so we drop it.
 */
function streamEventToWire(event: StreamEvent): BufferedEvent | null {
  if (event.kind === 'diff_hunk') return null;
  const payload: Record<string, unknown> = {};
  switch (event.kind) {
    case 'text':
      // Cloud's TextPayload schema expects `content`, not `text`.
      payload['content'] = event.text;
      break;
    case 'tool_use':
      payload['tool_use_id'] = event.toolUseId;
      payload['tool_name'] = event.name;
      payload['input'] = event.input;
      break;
    case 'tool_result':
      payload['tool_use_id'] = event.toolUseId;
      payload['is_error'] = event.isError;
      // Cloud's ToolResultPayload uses `output`, not `content`.
      payload['output'] = event.content;
      break;
    case 'session':
      payload['session_id'] = event.sessionId;
      // Cloud's SessionPayload requires `model` non-null; coerce
      // unknown to the literal "unknown" so the row still validates
      // and the model column on agent_runs (set elsewhere) is the
      // authoritative source.
      payload['model'] = event.model ?? 'unknown';
      break;
    case 'decision':
      payload['question'] = event.question;
      payload['options'] = event.options;
      if (event.timeoutSeconds !== undefined) {
        // sync-10: per-decision TTL override from the JSON block.
        payload['timeout_seconds'] = event.timeoutSeconds;
      }
      if (event.defaultValue !== undefined) {
        payload['default_value'] = event.defaultValue;
      }
      if (event.riskLevel !== undefined) {
        payload['risk_level'] = event.riskLevel;
      }
      break;
    case 'result': {
      // Cloud derives terminal run.status from payload.status. The
      // local parser only carries isError, so translate.
      payload['is_error'] = event.isError;
      payload['status'] = event.isError ? 'failed' : 'succeeded';
      payload['tokens_input'] = event.tokenUsage?.input ?? 0;
      payload['tokens_output'] = event.tokenUsage?.output ?? 0;
      payload['duration_ms'] = event.durationMs ?? 0;
      // sync-11: cost is a snapshot of cumulative spend through this
      // turn — the cloud now REPLACES with max(seen, payload), so we
      // ship the raw cumulative value. The field name keeps the
      // historical `_delta_` suffix because the schema uses it
      // everywhere; semantics are documented on the cloud side.
      if (event.totalCostUsd !== null && event.totalCostUsd !== undefined) {
        payload['cost_delta_usd_cents'] = Math.round(event.totalCostUsd * 100);
      }
      break;
    }
    case 'rate_limit':
      // Cloud's RateLimitPayload wants `provider`+`retry_after_seconds`,
      // not `reason`+`retryAfterMs`. Map the parser's `reason` to a
      // best-effort provider string; the original `reason` is folded
      // into the optional message so no information is lost.
      payload['provider'] = event.reason === 'overloaded' ? 'anthropic' : 'unknown';
      payload['retry_after_seconds'] = Math.round((event.retryAfterMs ?? 0) / 1000);
      if (event.message.length > 0) payload['message'] = event.message;
      break;
    case 'parse_error':
      // Cloud's ParseErrorPayload uses `raw_line`+`error`, not
      // `raw`+`message`.
      payload['raw_line'] = event.raw;
      payload['error'] = event.message;
      break;
    default: {
      // Exhaustiveness check — if a new StreamEvent kind is added we
      // want a type error here, not a silently-malformed payload.
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
  return { type: event.kind, payload };
}

/**
 * Start a cloud run. Returns *after* the run has been created on the cloud
 * and the CLI subprocess is spawned, so the renderer gets a runId
 * immediately and can subscribe to live events via the cloud SSE stream.
 *
 * The returned `done` promise resolves when the CLI exits and the final
 * event flush + synthetic terminal event (if any) lands on the cloud.
 */
export async function startCloudRun(
  opts: DispatchCloudRunOptions,
): Promise<CloudRunHandle> {
  const provider = opts.provider ?? 'claude-code';

  // Step 1 — create the pending run on the cloud.
  const run = await opts.cloudClient.runs.create(
    opts.orgSlug,
    opts.projectSlug,
    opts.cardNumber,
    {
      cli: PROVIDER_TO_CLI[provider],
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      provider: PROVIDER_TO_PROVIDER_TAG[provider],
    },
  );

  // Step 2 — claim it as the running worker. If this fails we still return
  // the runId so the renderer can surface a status; the background loop
  // won't post events for a run it doesn't own.
  let claimed = false;
  try {
    await opts.cloudClient.runs.claim(run.id);
    claimed = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[cloud-run-dispatcher] claim failed for run ${run.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  // Step 3 — create the per-run worktree. If this fails we surface the
  // error to the caller instead of silently running in the main checkout
  // (the whole point of this dispatcher is task-isolated runs). The
  // pending cloud row is left alone; the renderer can see it failed
  // because no events ever arrive.
  const worktreePath = worktreePathFor(opts.cwd, opts.cardNumber, run.id);
  const branchName = branchNameFor(opts.cardNumber, run.id);
  await createWorktree({
    repoPath: opts.cwd,
    branch: branchName,
    worktreePath,
  });
  // sync-06: report the per-run worktree+branch back to the cloud so
  // the board's "view branch" / "open PR" affordances have something
  // to link to. Best-effort: a 4xx/5xx here doesn't tear down the run
  // — the local worktree exists either way, and the user can still
  // see the artifacts via the desktop UI's Worktrees rail.
  if (claimed) {
    try {
      await opts.cloudClient.runs.setWorktree(run.id, {
        worktreePath,
        branchName,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[cloud-run-dispatcher] setWorktree failed for run ${run.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Step 4 — buffer + flush plumbing.
  const buffer: BufferedEvent[] = [];
  let flushing = false;
  let flushTimer: NodeJS.Timeout | null = null;
  let sawTerminalResult = false;
  let sawDecision = false;
  let runDisposed = false;
  /**
   * Pending batch metadata kept *outside* the buffer array so a retry
   * uses the original `Idempotency-Key` even when other events arrive
   * mid-flight. Per `sync-04` and `sync-05` — the cloud's events route
   * caches the response keyed on the same key, so re-uploading a
   * partially-applied batch is safe.
   */
  let pendingBatch: { events: BufferedEvent[]; idempotencyKey: string } | null = null;
  let consecutiveFailures = 0;
  let nextRetryAt = 0;

  function computeBackoffMs(attempt: number): number {
    const exp = Math.min(FLUSH_BACKOFF_BASE_MS * 2 ** attempt, FLUSH_BACKOFF_MAX_MS);
    // Jitter: ±25% so a burst of dispatchers don't synchronise their retries.
    const jitter = exp * (0.75 + Math.random() * 0.5);
    return Math.round(jitter);
  }

  async function flush(): Promise<void> {
    if (!claimed || runDisposed || flushing) return;
    if (pendingBatch === null && buffer.length === 0) return;
    if (Date.now() < nextRetryAt) return;

    flushing = true;
    // Re-use the previous batch on retry so the cloud's idempotency
    // cache (`Idempotency-Key`) returns the cached response without
    // double-inserting. Once the previous batch succeeds we move on to
    // the rest of the buffer.
    if (pendingBatch === null) {
      const events = buffer.splice(0, buffer.length);
      pendingBatch = { events, idempotencyKey: randomUUID() };
    }
    const batch = pendingBatch;
    try {
      await opts.cloudClient.runs.appendEvents(run.id, batch.events, {
        idempotencyKey: batch.idempotencyKey,
      });
      pendingBatch = null;
      consecutiveFailures = 0;
      nextRetryAt = 0;
    } catch (err) {
      consecutiveFailures += 1;
      const giveUp = consecutiveFailures >= MAX_FLUSH_ATTEMPTS;
      // eslint-disable-next-line no-console
      console.warn(
        `[cloud-run-dispatcher] flush failed for run ${run.id} (attempt ${consecutiveFailures}/${MAX_FLUSH_ATTEMPTS})${giveUp ? ' — dropping batch' : ''}:`,
        err instanceof Error ? err.message : err,
      );
      if (giveUp) {
        // Last resort: drop the batch so we don't loop forever. The
        // events are gone but the dispatcher keeps running. A future
        // on-disk spool would write here instead.
        pendingBatch = null;
        consecutiveFailures = 0;
        nextRetryAt = 0;
      } else {
        nextRetryAt = Date.now() + computeBackoffMs(consecutiveFailures);
        // Re-schedule a flush after the backoff so a subsequent event
        // arriving early doesn't burn the retry slot.
        scheduleRetry();
      }
    } finally {
      flushing = false;
    }
    // If more events accumulated while we were flushing, kick another
    // pass immediately so we don't wait for the next timer tick.
    if (!runDisposed && buffer.length >= FLUSH_BATCH_SIZE) {
      void flush();
    }
  }

  function scheduleRetry(): void {
    if (flushTimer !== null) return;
    const delay = Math.max(nextRetryAt - Date.now(), FLUSH_INTERVAL_MS);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, delay);
  }

  function schedule(): void {
    if (buffer.length >= MAX_BUFFERED_EVENTS) {
      // Hard cap: drop the oldest events when the buffer is saturated
      // so we don't OOM during a long outage. Logs once per overflow
      // window so the user has a breadcrumb when their dashboard goes
      // suddenly quiet.
      const dropped = buffer.splice(0, buffer.length - MAX_BUFFERED_EVENTS);
      if (dropped.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[cloud-run-dispatcher] buffer overflow on run ${run.id} — dropped ${dropped.length} events`,
        );
      }
    }
    if (Date.now() < nextRetryAt) {
      // Still in backoff — let the existing timer fire.
      return;
    }
    if (buffer.length >= FLUSH_BATCH_SIZE) {
      void flush();
      return;
    }
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, FLUSH_INTERVAL_MS);
    }
  }

  // Step 5 — spawn the CLI inside the per-run worktree.
  const handle = startAgentRun({
    cwd: worktreePath,
    prompt: opts.prompt,
    ...(opts.appendSystemPrompt !== undefined
      ? { appendSystemPrompt: opts.appendSystemPrompt }
      : {}),
    ...(opts.model !== undefined ? { model: opts.model } : {}),
    provider,
  });

  handle.on('event', (event: StreamEvent) => {
    if (opts.onEvent !== undefined) {
      try {
        opts.onEvent(event);
      } catch {
        // listener crash mustn't tear down the run
      }
    }
    if (event.kind === 'result') sawTerminalResult = true;
    // sync-01 + sync-02: when the CLI emits a decision and then exits
    // (the local supervisor's awaiting_input flow), the dispatcher must
    // NOT post a synthetic `succeeded` terminal — that would clobber
    // the cloud's transition to `awaiting_input` and orphan the
    // decision row from a now-terminal run.
    if (event.kind === 'decision') sawDecision = true;

    // Surface edit-tool calls to the workspace tree so the file's
    // badge flips before the next git poll. Lives here (not in main.ts)
    // because the dispatcher is the one that knows which worktree path
    // the run is actually editing — main.ts only knows the bound-repo
    // root.
    if (opts.onFileTouched !== undefined && event.kind === 'tool_use') {
      if (/^(Edit|Write|MultiEdit)$/i.test(event.name)) {
        const input = event.input as Record<string, unknown> | null | undefined;
        const raw =
          input !== null && input !== undefined
            ? input['file_path'] ?? input['filePath'] ?? input['path']
            : undefined;
        if (typeof raw === 'string' && raw.length > 0) {
          try {
            opts.onFileTouched({ filePath: raw, worktreePath });
          } catch {
            // listener crash mustn't tear down the run
          }
        }
      }
    }

    const wire = streamEventToWire(event);
    if (wire === null) return;
    buffer.push(wire);
    schedule();
  });

  // Background completion — drains buffer, posts synthetic terminal if
  // needed, then resolves the public `done` promise.
  const done = (async (): Promise<CloudRunSummary> => {
    const summary = await handle.done;
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await flush();

    // sync-01 + sync-02: only post a synthetic terminal when the run
    // really is finished. A clean CLI exit after emitting a decision
    // block leaves the run in `awaiting_input` on the cloud (the local
    // supervisor's equivalent path) until a user answers the
    // decision. Posting a synthetic `succeeded` here would terminate
    // the run and orphan the decision row.
    const synthesizeTerminal = claimed
      && !sawTerminalResult
      && !(sawDecision && summary.exitCode === 0 && !summary.killedByStop);
    if (synthesizeTerminal) {
      const synthStatus = summary.killedByStop
        ? 'stopped'
        : summary.exitCode === 0
          ? 'succeeded'
          : 'failed';
      try {
        await opts.cloudClient.runs.appendEvents(
          run.id,
          [
            {
              type: 'result',
              source: 'system',
              payload: {
                is_error: synthStatus !== 'succeeded',
                status: synthStatus,
                tokens_input: 0,
                tokens_output: 0,
                duration_ms: 0,
                cost_delta_usd_cents: 0,
                ...(summary.exitCode !== null ? { exit_code: summary.exitCode } : {}),
                ...(summary.killedByStop ? { reason: 'stopped_by_user' } : {}),
                ...(summary.stderr ? { stderr_tail: summary.stderr.slice(-2048) } : {}),
              },
            },
          ],
          { idempotencyKey: `${run.id}:synth-terminal` },
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[cloud-run-dispatcher] failed to post synthetic terminal for ${run.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    runDisposed = true;

    let finalStatus = 'unknown';
    try {
      const final = await opts.cloudClient.runs.get(
        opts.orgSlug,
        opts.projectSlug,
        run.id,
      );
      finalStatus = final.status;
    } catch {
      // best-effort
    }

    return { runId: run.id, worktreePath, status: finalStatus, exitCode: summary.exitCode };
  })();

  return {
    runId: run.id,
    worktreePath,
    done,
    stop: () => handle.stop(),
  };
}
