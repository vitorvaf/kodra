/**
 * Typed HTTP client for the Kanbots Cloud v1 API. Uses a user-scoped
 * bearer token (kind='user' agent_token) so it can act on behalf of
 * the signed-in user across all their orgs — same authority as the
 * Clerk session in the browser.
 */

import { CloudClientError, bypassHeaders, request, type CloudClientOptions } from './http.js';
import type {
  AgentRunListResponse,
  AgentRunSummary,
  AttachmentListResponse,
  AttachmentSummary,
  CardListResponse,
  CardSummary,
  CommentListResponse,
  CommentSummary,
  CreateAgentRunRequest,
  CreateCardRequest,
  CreateOrgRequest,
  CreateOrgResponse,
  CreateProjectRequest,
  LabelSummary,
  ListCardsQuery,
  OrgListResponse,
  ProjectListResponse,
  ProjectSummary,
  PromoteRequest,
  PromotionSummary,
  UpdateCardRequest,
  UserMe,
} from './types.js';

export type { CloudClientOptions } from './http.js';
export { CloudClientError } from './http.js';
export type * from './types.js';

export interface CloudClient {
  users: {
    me(): Promise<UserMe>;
  };
  orgs: {
    list(opts?: { cursor?: string; limit?: number }): Promise<OrgListResponse>;
    create(body: CreateOrgRequest): Promise<CreateOrgResponse>;
  };
  projects: {
    list(orgSlug: string): Promise<ProjectListResponse>;
    create(orgSlug: string, body: CreateProjectRequest): Promise<ProjectSummary>;
  };
  cards: {
    list(
      orgSlug: string,
      projectSlug: string,
      query?: ListCardsQuery,
    ): Promise<CardListResponse>;
    get(orgSlug: string, projectSlug: string, number: number): Promise<CardSummary>;
    create(
      orgSlug: string,
      projectSlug: string,
      body: CreateCardRequest,
    ): Promise<CardSummary>;
    update(
      orgSlug: string,
      projectSlug: string,
      number: number,
      body: UpdateCardRequest,
      opts?: { ifMatch?: string },
    ): Promise<CardSummary>;
    /** Soft-delete: sets archived_at. Backend accepts DELETE on the card. */
    archive(orgSlug: string, projectSlug: string, number: number): Promise<void>;
    /** Inverse of archive: clears archived_at. Returns the restored card. */
    unarchive(orgSlug: string, projectSlug: string, number: number): Promise<CardSummary>;
  };
  comments: {
    list(
      orgSlug: string,
      projectSlug: string,
      number: number,
    ): Promise<CommentListResponse>;
    add(
      orgSlug: string,
      projectSlug: string,
      number: number,
      body: string,
      /** Per `sync-13`, supplying a parent_comment_id creates a threaded reply. */
      opts?: { parentCommentId?: string },
    ): Promise<CommentSummary>;
    delete(orgSlug: string, commentId: string): Promise<void>;
  };
  attachments: {
    list(
      orgSlug: string,
      projectSlug: string,
      number: number,
    ): Promise<AttachmentListResponse>;
    upload(
      orgSlug: string,
      projectSlug: string,
      number: number,
      file: { filename: string; contentType: string; bytes: Uint8Array | Blob },
    ): Promise<AttachmentSummary>;
  };
  runs: {
    listForCard(
      orgSlug: string,
      projectSlug: string,
      number: number,
    ): Promise<AgentRunListResponse>;
    create(
      orgSlug: string,
      projectSlug: string,
      number: number,
      body: CreateAgentRunRequest,
    ): Promise<AgentRunSummary>;
    get(orgSlug: string, projectSlug: string, runId: string): Promise<AgentRunSummary>;
    /**
     * Subscribe to NDJSON / SSE events for a run. Yields raw event
     * payloads (already JSON-parsed); caller re-narrows. Resumes via
     * Last-Event-ID when reconnecting.
     */
    stream(
      orgSlug: string,
      projectSlug: string,
      runId: string,
      opts?: { lastEventId?: string; signal?: AbortSignal },
    ): AsyncIterable<{ id: string; event: string; data: unknown }>;
    /**
     * Claim a pending run for execution. Returns the claimed run's status —
     * 200 idempotent if the same caller claimed it earlier, 409 if another
     * worker / token has it.
     *
     * Lives at `/api/v1/agent/runs/[id]/claim` (org-less path) because it
     * historically targeted agent-scoped tokens; user-scoped tokens are
     * accepted when the user owns the run (cloud-mode desktop pattern).
     */
    claim(
      runId: string,
      opts?: { sessionId?: string },
    ): Promise<{ run_id: string; status: string; already_claimed?: boolean; started_at?: string }>;
    /**
     * Set the per-run worktree path and branch name on the cloud row.
     * Called by the dispatcher once the local worktree is created — the
     * path embeds the run id so we can't supply these at create time.
     * See `sync-06`.
     */
    setWorktree(
      runId: string,
      body: { worktreePath?: string | null; branchName?: string | null },
    ): Promise<{ id: string; worktree_path: string | null; branch_name: string | null }>;
    /**
     * Stop a running cloud run from the cloud UI. Inserts a
     * `stop_signal` event on the run's event stream so the downstream
     * SSE consumer (desktop daemon) can abort the local CLI subprocess.
     * Per `sync-09`.
     */
    stop(
      orgSlug: string,
      projectSlug: string,
      runId: string,
      opts?: { reason?: string },
    ): Promise<{ id: string; status: string }>;
    /**
     * Record a promotion (commit landed, PR opened, or run discarded) on
     * the cloud's `promotions` table. Per `sync-07`, called best-effort
     * by the local `promoteCommit` / `promotePr` handlers so the cloud
     * board can surface "PR #N — open" / "merged in <sha>" stickers.
     */
    promote(
      orgSlug: string,
      projectSlug: string,
      runId: string,
      body: PromoteRequest,
    ): Promise<PromotionSummary>;
    /**
     * Discover pending runs scoped to an org the calling user belongs
     * to. Used by the desktop to poll work queued from the web UI.
     * Per `sync-08`.
     */
    listPending(
      orgSlug: string,
      opts?: { limit?: number },
    ): Promise<{ data: AgentRunSummary[] }>;
    /**
     * Append NDJSON events to a run owned by the caller. Lines are
     * `{type, payload, source?}` objects joined by `\n`. The cloud
     * derives terminal status (succeeded / failed / stopped) from
     * `type: 'result'` events automatically.
     *
     * Pass `opts.idempotencyKey` (any unique string per batch) so the
     * cloud's event-ingest dedup cache (`sync-05`) replays the same
     * response for a retried request instead of double-inserting.
     */
    appendEvents(
      runId: string,
      events: ReadonlyArray<{ type: string; payload?: unknown; source?: 'agent' | 'system' }>,
      opts?: { idempotencyKey?: string },
    ): Promise<{ inserted: number; bad_lines: number; event_count: number; status: string }>;
    /**
     * Continue an `awaiting_input` cloud run by feeding the answered
     * decision back to a fresh CLI invocation in the same worktree.
     * Local equivalent of the supervisor's `cards:resolve` flow.
     * Implemented client-side because the cloud has no notion of "spawn
     * a new CLI" — only the desktop daemon does. See `sync-01`.
     */
    continueWithDecision?(
      runId: string,
      decision: { value: string; note?: string },
    ): Promise<void>;
  };
  /**
   * Labels API per `sync-14` — the cloud schema exists but the
   * routes/client were missing. Mirrors the cloud `/projects/:p/labels`
   * collection and the `/cards/:n/labels` attach/detach surface.
   */
  labels: {
    list(orgSlug: string, projectSlug: string): Promise<{ data: LabelSummary[] }>;
    create(
      orgSlug: string,
      projectSlug: string,
      body: { name: string; color: string; description?: string },
    ): Promise<LabelSummary>;
    /** List labels currently attached to a card. */
    listForCard(
      orgSlug: string,
      projectSlug: string,
      cardNumber: number,
    ): Promise<{ data: LabelSummary[] }>;
    attach(
      orgSlug: string,
      projectSlug: string,
      cardNumber: number,
      labelId: string,
    ): Promise<void>;
    detach(
      orgSlug: string,
      projectSlug: string,
      cardNumber: number,
      labelId: string,
    ): Promise<void>;
  };
  billing: {
    /**
     * Sum of agent-run cost in USD across the org since midnight UTC
     * of the calling day. Used by the board's "$X today" stats line.
     */
    costToday(orgSlug: string): Promise<{ totalUsd: number; since: string }>;
  };
}

function encodeStatusFilter(values: ListCardsQuery['status']): string | undefined {
  if (values === undefined || values.length === 0) return undefined;
  return values.join(',');
}

function bodyToFormData(file: {
  filename: string;
  contentType: string;
  bytes: Uint8Array | Blob;
}): FormData {
  const fd = new FormData();
  let blob: Blob;
  if (file.bytes instanceof Blob) {
    blob = file.bytes;
  } else {
    // Copy into a fresh ArrayBuffer so the BlobPart typing matches —
    // a Uint8Array view backed by SharedArrayBuffer is not assignable
    // even though it works at runtime.
    const ab = file.bytes.buffer.slice(
      file.bytes.byteOffset,
      file.bytes.byteOffset + file.bytes.byteLength,
    ) as ArrayBuffer;
    blob = new Blob([ab], { type: file.contentType });
  }
  fd.append('file', blob, file.filename);
  return fd;
}

export function createCloudClient(opts: CloudClientOptions): CloudClient {
  return {
    users: {
      me: () => request<UserMe>(opts, { method: 'GET', path: '/api/v1/users/me' }),
    },
    orgs: {
      list: (q) => {
        const query: Record<string, string | number | boolean | undefined | null> = {};
        if (q?.cursor !== undefined) query.cursor = q.cursor;
        if (q?.limit !== undefined) query.limit = q.limit;
        return request<OrgListResponse>(opts, {
          method: 'GET',
          path: '/api/v1/orgs',
          query,
        });
      },
      create: (body) =>
        request<CreateOrgResponse>(opts, {
          method: 'POST',
          path: '/api/v1/orgs',
          body,
        }),
    },
    projects: {
      list: (orgSlug) =>
        request<ProjectListResponse>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects`,
        }),
      create: (orgSlug, body) =>
        request<ProjectSummary>(opts, {
          method: 'POST',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects`,
          body,
        }),
    },
    cards: {
      list: (orgSlug, projectSlug, query) => {
        const q: Record<string, string | number | boolean | undefined | null> = {};
        if (query?.cursor !== undefined) q.cursor = query.cursor;
        if (query?.limit !== undefined) q.limit = query.limit;
        if (query?.assignee_user_id !== undefined) q.assignee_user_id = query.assignee_user_id;
        if (query?.include_archived !== undefined) q.include_archived = query.include_archived;
        const status = encodeStatusFilter(query?.status);
        if (status !== undefined) q.status = status;
        return request<CardListResponse>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards`,
          query: q,
        });
      },
      get: (orgSlug, projectSlug, number) =>
        request<CardSummary>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${number}`,
        }),
      create: (orgSlug, projectSlug, body) =>
        request<CardSummary>(opts, {
          method: 'POST',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards`,
          body,
        }),
      update: (orgSlug, projectSlug, number, body, ro) =>
        request<CardSummary>(opts, {
          method: 'PATCH',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${number}`,
          body,
          ...(ro?.ifMatch !== undefined ? { ifMatch: ro.ifMatch } : {}),
        }),
      archive: (orgSlug, projectSlug, number) =>
        request<void>(opts, {
          method: 'DELETE',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${number}`,
        }),
      unarchive: (orgSlug, projectSlug, number) =>
        request<CardSummary>(opts, {
          method: 'POST',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${number}/unarchive`,
        }),
    },
    comments: {
      list: (orgSlug, projectSlug, number) =>
        request<CommentListResponse>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${number}/comments`,
        }),
      add: (orgSlug, projectSlug, number, bodyText, addOpts) =>
        request<CommentSummary>(opts, {
          method: 'POST',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${number}/comments`,
          body: {
            body: bodyText,
            ...(addOpts?.parentCommentId !== undefined
              ? { parent_comment_id: addOpts.parentCommentId }
              : {}),
          },
        }),
      delete: (orgSlug, commentId) =>
        request<void>(opts, {
          method: 'DELETE',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/comments/${encodeURIComponent(commentId)}`,
        }),
    },
    attachments: {
      list: (orgSlug, projectSlug, number) =>
        request<AttachmentListResponse>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${number}/attachments`,
        }),
      upload: (orgSlug, projectSlug, number, file) =>
        request<AttachmentSummary>(opts, {
          method: 'POST',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${number}/attachments`,
          rawBody: bodyToFormData(file),
        }),
    },
    runs: {
      listForCard: (orgSlug, projectSlug, number) =>
        request<AgentRunListResponse>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${number}/runs`,
        }),
      create: (orgSlug, projectSlug, number, body) =>
        request<AgentRunSummary>(opts, {
          method: 'POST',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${number}/runs`,
          body,
        }),
      get: (orgSlug, projectSlug, runId) =>
        request<AgentRunSummary>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}`,
        }),
      stream: (orgSlug, projectSlug, runId, streamOpts) =>
        streamRunEvents(opts, orgSlug, projectSlug, runId, streamOpts),
      claim: (runId, claimOpts) =>
        request<{
          run_id: string;
          status: string;
          already_claimed?: boolean;
          started_at?: string;
        }>(opts, {
          method: 'POST',
          path: `/api/v1/agent/runs/${encodeURIComponent(runId)}/claim`,
          body: claimOpts?.sessionId !== undefined ? { session_id: claimOpts.sessionId } : {},
        }),
      appendEvents: (runId, events, appendOpts) => {
        const ndjson = events.map((e) => JSON.stringify(e)).join('\n');
        return request<{
          inserted: number;
          bad_lines: number;
          event_count: number;
          status: string;
        }>(opts, {
          method: 'POST',
          path: `/api/v1/agent/runs/${encodeURIComponent(runId)}/events`,
          rawBody: ndjson,
          rawContentType: 'application/x-ndjson',
          ...(appendOpts?.idempotencyKey !== undefined
            ? { idempotencyKey: appendOpts.idempotencyKey }
            : {}),
        });
      },
      setWorktree: (runId, body) =>
        request<{ id: string; worktree_path: string | null; branch_name: string | null }>(
          opts,
          {
            method: 'PATCH',
            path: `/api/v1/agent/runs/${encodeURIComponent(runId)}`,
            body: {
              ...(body.worktreePath !== undefined ? { worktree_path: body.worktreePath } : {}),
              ...(body.branchName !== undefined ? { branch_name: body.branchName } : {}),
            },
          },
        ),
      stop: (orgSlug, projectSlug, runId, stopOpts) =>
        request<{ id: string; status: string }>(opts, {
          method: 'POST',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}/stop`,
          body: stopOpts?.reason !== undefined ? { reason: stopOpts.reason } : {},
        }),
      promote: (orgSlug, projectSlug, runId, body) =>
        request<PromotionSummary>(opts, {
          method: 'POST',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}/promotions`,
          body,
        }),
      listPending: (orgSlug, pendingOpts) => {
        const q: Record<string, string | number | undefined> = {};
        if (pendingOpts?.limit !== undefined) q.limit = pendingOpts.limit;
        return request<{ data: AgentRunSummary[] }>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/agent/runs/pending`,
          query: q,
        });
      },
    },
    labels: {
      list: (orgSlug, projectSlug) =>
        request<{ data: LabelSummary[] }>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/labels`,
        }),
      create: (orgSlug, projectSlug, body) =>
        request<LabelSummary>(opts, {
          method: 'POST',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/labels`,
          body,
        }),
      listForCard: (orgSlug, projectSlug, cardNumber) =>
        request<{ data: LabelSummary[] }>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${cardNumber}/labels`,
        }),
      attach: (orgSlug, projectSlug, cardNumber, labelId) =>
        request<void>(opts, {
          method: 'POST',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${cardNumber}/labels`,
          body: { label_id: labelId },
        }),
      detach: (orgSlug, projectSlug, cardNumber, labelId) =>
        request<void>(opts, {
          method: 'DELETE',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/cards/${cardNumber}/labels/${encodeURIComponent(labelId)}`,
        }),
    },
    billing: {
      costToday: (orgSlug) =>
        request<{ totalUsd: number; since: string }>(opts, {
          method: 'GET',
          path: `/api/v1/orgs/${encodeURIComponent(orgSlug)}/billing/cost-today`,
        }),
    },
  };
}

/**
 * Reads the SSE stream for a run and yields parsed events. The
 * stream uses the standard `event: <name>\ndata: <json>\n\n`
 * format; we surface `id` separately so the caller can resume via
 * Last-Event-ID after a disconnect.
 */
async function* streamRunEvents(
  opts: CloudClientOptions,
  orgSlug: string,
  projectSlug: string,
  runId: string,
  streamOpts: { lastEventId?: string; signal?: AbortSignal } | undefined,
): AsyncIterable<{ id: string; event: string; data: unknown }> {
  const baseUrl = await opts.getBaseUrl();
  const token = await opts.getToken();
  if (token === null) throw new CloudClientError('UNAUTHENTICATED', 0);

  const url = new URL(
    `/api/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}/stream`,
    baseUrl,
  );
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: 'text/event-stream',
    ...(await bypassHeaders(opts)),
  };
  if (streamOpts?.lastEventId !== undefined) {
    headers['last-event-id'] = streamOpts.lastEventId;
  }

  const fetchFn = opts.fetch ?? globalThis.fetch;
  const init: RequestInit = { method: 'GET', headers };
  if (streamOpts?.signal !== undefined) init.signal = streamOpts.signal;
  const res = await fetchFn(url, init);
  if (!res.ok || res.body === null) {
    throw new CloudClientError(`STREAM_${res.status}`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const ev = parseSseBlock(block);
      if (ev !== null) yield ev;
    }
  }
}

function parseSseBlock(
  block: string,
): { id: string; event: string; data: unknown } | null {
  let id = '';
  let event = 'message';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith(':') || line.length === 0) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon);
    const val = line.slice(colon + 1).trimStart();
    if (field === 'id') id = val;
    else if (field === 'event') event = val;
    else if (field === 'data') data += (data.length > 0 ? '\n' : '') + val;
  }
  if (data.length === 0 && id.length === 0) return null;
  let parsed: unknown = data;
  try {
    parsed = JSON.parse(data);
  } catch {
    // leave as string if not JSON
  }
  return { id, event, data: parsed };
}
