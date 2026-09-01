import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { shell } from 'electron';

// These OAuth values mirror the public Claude Code CLI. They are not
// documented by Anthropic — if login starts failing, check the latest
// @anthropic-ai/claude-code package for updated values.
const OAUTH = {
  authorizeUrl: 'https://claude.com/cai/oauth/authorize',
  tokenUrl: 'https://platform.claude.com/v1/oauth/token',
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  scopes:
    'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload',
  successUrl: 'https://platform.claude.com/oauth/code/success?app=claude-code',
  loopbackPath: '/callback',
};

export const CREDENTIALS_PATH = join(homedir(), '.claude', '.credentials.json');

interface StoredCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType?: string;
  };
}

type OAuthCreds = NonNullable<StoredCredentials['claudeAiOauth']>;

interface PendingLogin {
  verifier: string;
  state: string;
  port: number;
  server: Server;
  resolve: (creds: OAuthCreds) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

let pending: PendingLogin | null = null;

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeVerifier(): string {
  return base64url(randomBytes(32));
}

function makeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

export async function isClaudeAuthenticated(): Promise<boolean> {
  try {
    const raw = await readFile(CREDENTIALS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as StoredCredentials;
    const oauth = parsed.claudeAiOauth;
    if (!oauth?.accessToken) return false;
    // Allow expired access tokens — the CLI will refresh on demand.
    // We only require that *some* credentials are present.
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    return false;
  }
}

async function writeCredentials(oauth: OAuthCreds): Promise<void> {
  let existing: StoredCredentials = {};
  try {
    const raw = await readFile(CREDENTIALS_PATH, 'utf-8');
    existing = JSON.parse(raw) as StoredCredentials;
  } catch {
    // file missing or unreadable — start fresh
  }
  existing.claudeAiOauth = oauth;
  await mkdir(dirname(CREDENTIALS_PATH), { recursive: true });
  await writeFile(CREDENTIALS_PATH, JSON.stringify(existing, null, 2), 'utf-8');
  // Restrict to user-only — the CLI does the same.
  try {
    const { chmod } = await import('node:fs/promises');
    await chmod(CREDENTIALS_PATH, 0o600);
  } catch {
    // best-effort
  }
}

async function exchangeCode(
  code: string,
  verifier: string,
  state: string,
  redirectUri: string,
): Promise<OAuthCreds> {
  const body = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: OAUTH.clientId,
    code_verifier: verifier,
    state,
  };
  const res = await fetch(OAUTH.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${res.status}): ${text || 'no body'}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
    subscription_type?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    scopes: (json.scope ?? OAUTH.scopes).split(/\s+/).filter(Boolean),
    ...(json.subscription_type ? { subscriptionType: json.subscription_type } : {}),
  };
}

function endPending(err: Error | null, creds?: OAuthCreds): void {
  if (!pending) return;
  clearTimeout(pending.timer);
  try {
    pending.server.close();
  } catch {
    // ignore
  }
  if (err) pending.reject(err);
  else if (creds) pending.resolve(creds);
  pending = null;
}

function handleCallback(req: IncomingMessage, res: ServerResponse): void {
  if (!pending) {
    res.statusCode = 410;
    res.end('No pending login.');
    return;
  }
  const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== OAUTH.loopbackPath) {
    res.statusCode = 404;
    res.end('Not found.');
    return;
  }
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const failHtml = (message: string): string =>
    `<!doctype html><html><head><title>Sign-in failed</title><meta charset="utf-8"><style>body{font-family:system-ui;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0}.card{background:#1c1c1c;border:1px solid #333;border-radius:12px;padding:32px 40px;text-align:center;max-width:420px}h1{margin:0 0 8px;font-size:18px}p{margin:0;color:#aaa;font-size:14px}</style></head><body><div class="card"><h1>Sign-in failed</h1><p>${message}</p></div></body></html>`;

  if (error) {
    res.setHeader('content-type', 'text/html');
    res.end(failHtml(`Anthropic returned: ${error}`));
    endPending(new Error(`OAuth error: ${error}`));
    return;
  }
  if (!code || !state) {
    res.setHeader('content-type', 'text/html');
    res.end(failHtml('Missing code or state in callback.'));
    endPending(new Error('Missing code or state in callback.'));
    return;
  }
  if (state !== pending.state) {
    res.setHeader('content-type', 'text/html');
    res.end(failHtml('State mismatch — possible CSRF.'));
    endPending(new Error('OAuth state mismatch.'));
    return;
  }

  const { verifier, port } = pending;
  const redirectUri = `http://localhost:${port}${OAUTH.loopbackPath}`;
  exchangeCode(code, verifier, state, redirectUri)
    .then(async (creds) => {
      await writeCredentials(creds);
      res.writeHead(302, { Location: OAUTH.successUrl });
      res.end();
      endPending(null, creds);
    })
    .catch((err: Error) => {
      res.setHeader('content-type', 'text/html');
      res.end(failHtml(err.message));
      endPending(err);
    });
}

export interface ClaudeLoginResult {
  ok: true;
}

export interface ClaudeLoginError {
  ok: false;
  error: string;
}

export async function startClaudeLogin(): Promise<ClaudeLoginResult | ClaudeLoginError> {
  if (pending) {
    endPending(new Error('Login restarted.'));
  }

  const verifier = makeVerifier();
  const challenge = makeChallenge(verifier);
  const state = base64url(randomBytes(32));

  const server = createServer(handleCallback);

  const listenResult = await new Promise<Error | null>((resolve) => {
    server.once('error', (err) => resolve(err));
    // Port 0 = OS-assigned ephemeral port, matching the Claude Code CLI.
    server.listen(0, '127.0.0.1', () => resolve(null));
  });
  if (listenResult) {
    return {
      ok: false,
      error: `Could not bind to localhost for the OAuth callback. (${listenResult.message})`,
    };
  }
  const address = server.address() as AddressInfo | null;
  if (!address || typeof address === 'string') {
    server.close();
    return { ok: false, error: 'Could not determine OAuth callback port.' };
  }
  const port = address.port;
  const redirectUri = `http://localhost:${port}${OAUTH.loopbackPath}`;

  const completion = new Promise<OAuthCreds>((resolve, reject) => {
    const timer = setTimeout(
      () => endPending(new Error('Sign-in timed out after 5 minutes.')),
      5 * 60 * 1000,
    );
    pending = { verifier, state, port, server, resolve, reject, timer };
  });

  const params = new URLSearchParams({
    code: 'true',
    client_id: OAUTH.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: OAUTH.scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  const authUrl = `${OAUTH.authorizeUrl}?${params.toString()}`;

  await shell.openExternal(authUrl);

  try {
    await completion;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function cancelClaudeLogin(): void {
  endPending(new Error('Sign-in cancelled by user.'));
}
