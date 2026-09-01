import type { ApiErrorBody } from './types.js';

export interface CloudClientOptions {
  /**
   * Resolved each call so token rotation / sign-in / sign-out is
   * picked up without rebuilding the client.
   */
  getToken: () => Promise<string | null>;
  /** Same: lets the desktop app point at staging or a self-hosted cloud. */
  getBaseUrl: () => Promise<string>;
  /**
   * Optional Vercel-style deployment-protection bypass token. When set,
   * forwarded as `x-vercel-protection-bypass` on every request so the
   * client can talk to a protected preview/branch deploy. Resolves to
   * null for prod/self-hosted endpoints that aren't behind protection.
   */
  getBypassToken?: () => Promise<string | null>;
  /** Optional fetch override (for tests). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

/** Resolve the optional deployment-protection bypass header. */
export async function bypassHeaders(
  opts: CloudClientOptions,
): Promise<Record<string, string>> {
  if (!opts.getBypassToken) return {};
  const token = await opts.getBypassToken();
  return token ? { 'x-vercel-protection-bypass': token } : {};
}

export class CloudClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly detail?: unknown,
  ) {
    super(`${code}${status > 0 ? ` (HTTP ${status})` : ''}`);
    this.name = 'CloudClientError';
  }
}

export interface RequestInput {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Set to skip JSON parsing and return raw text (used for SSE elsewhere). */
  raw?: boolean;
  /** Optional `If-Match` header value (quoted ETag). */
  ifMatch?: string;
  /**
   * Optional `Idempotency-Key` header value — per `sync-05`, the cloud's
   * agent-event ingest dedupes responses keyed on
   * `(run_id, Idempotency-Key)` for 24 h. Callers that retry the same
   * batch (network blip, gateway timeout) must reuse the same key so the
   * server returns the cached response instead of double-inserting.
   */
  idempotencyKey?: string;
  /** Multipart bodies — caller passes a FormData / Blob / Uint8Array. */
  rawBody?: BodyInit;
  rawContentType?: string;
}

function buildUrl(baseUrl: string, path: string, query?: RequestInput['query']): string {
  const u = new URL(path, baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

export async function request<T>(
  opts: CloudClientOptions,
  input: RequestInput,
): Promise<T> {
  const baseUrl = await opts.getBaseUrl();
  const token = await opts.getToken();
  if (token === null) {
    throw new CloudClientError('UNAUTHENTICATED', 0);
  }

  const url = buildUrl(baseUrl, input.path, input.query);
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    ...(await bypassHeaders(opts)),
  };
  if (input.ifMatch !== undefined) headers['if-match'] = input.ifMatch;
  if (input.idempotencyKey !== undefined) {
    headers['idempotency-key'] = input.idempotencyKey;
  }

  let body: BodyInit | undefined;
  if (input.rawBody !== undefined) {
    body = input.rawBody;
    if (input.rawContentType !== undefined) {
      headers['content-type'] = input.rawContentType;
    }
  } else if (input.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(input.body);
  }

  const fetchFn = opts.fetch ?? globalThis.fetch;
  const init: RequestInit = { method: input.method, headers };
  if (body !== undefined) init.body = body;
  const res = await fetchFn(url, init);

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      // non-JSON error
    }
    const code = parsed?.error?.code ?? `HTTP_${res.status}`;
    throw new CloudClientError(code, res.status, parsed?.error?.detail);
  }

  if (input.raw === true) {
    return (await res.text()) as unknown as T;
  }
  return (await res.json()) as T;
}
