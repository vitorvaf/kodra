import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app, safeStorage, shell } from 'electron';

const DEFAULT_BASE_URL = process.env['KANBOTS_CLOUD_BASE_URL'] ?? 'https://app.kanbots.dev';

// Optional Vercel deployment-protection bypass token. When the cloud base URL
// points at a protected preview/branch deploy, the API rejects unauthenticated
// requests with 401. Set KANBOTS_CLOUD_BYPASS_TOKEN to the project's "Protection
// Bypass for Automation" secret and we forward it on every cloud fetch. Unset
// for normal users — the standard prod URL is unprotected.
function bypassHeader(): Record<string, string> {
  const token = process.env['KANBOTS_CLOUD_BYPASS_TOKEN'];
  return token ? { 'x-vercel-protection-bypass': token } : {};
}

interface CloudConfigFileV1 {
  v: 1;
  encryption: 'safe' | 'plain';
  token_buffer_b64: string;
  base_url: string;
  token_id: string;
  token_prefix: string;
  org_id: string | null;
  signed_in_at: string;
  prompt_dismissed_at: string | null;
}

interface CloudConfigPromptOnly {
  v: 1;
  encryption: 'safe' | 'plain';
  token_buffer_b64: '';
  base_url: '';
  token_id: '';
  token_prefix: '';
  org_id: null;
  signed_in_at: '';
  prompt_dismissed_at: string;
}

type CloudConfigFile = CloudConfigFileV1 | CloudConfigPromptOnly;

export interface CloudStatus {
  authed: boolean;
  baseUrl: string | null;
  tokenPrefix: string | null;
  orgId: string | null;
  signedInAt: string | null;
  promptDismissed: boolean;
}

interface DeviceStartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

type DevicePollResponse =
  | { status: 'pending' }
  | { status: 'expired' | 'consumed' }
  | {
      status: 'approved';
      token: string;
      token_id: string;
      org_id: string | null;
    };

interface PendingLogin {
  baseUrl: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: number;
  intervalMs: number;
  cancelled: boolean;
}

let pendingLogin: PendingLogin | null = null;

function configPath(): string {
  return join(app.getPath('userData'), 'cloud-config.json');
}

async function readConfig(): Promise<CloudConfigFile | null> {
  try {
    const raw = await readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as CloudConfigFile;
    if (parsed.v !== 1) return null;
    return parsed;
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'ENOENT') return null;
    return null;
  }
}

async function writeConfig(cfg: CloudConfigFile): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function encryptToken(plaintext: string): { encryption: 'safe' | 'plain'; buffer_b64: string } {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encryption: 'safe',
      buffer_b64: safeStorage.encryptString(plaintext).toString('base64'),
    };
  }
  return {
    encryption: 'plain',
    buffer_b64: Buffer.from(plaintext, 'utf8').toString('base64'),
  };
}

function decryptToken(b64: string, encryption: 'safe' | 'plain'): string | null {
  if (b64.length === 0) return null;
  const buf = Buffer.from(b64, 'base64');
  if (encryption === 'safe') {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  }
  return buf.toString('utf8');
}

/**
 * Cloud-only launch: throw a typed error when no valid cloud session
 * exists. IPC handlers, the tool-bridge dispatch path, and CLI/MCP
 * entry points call this to enforce the sign-in gate.
 */
export class CloudAuthRequiredError extends Error {
  readonly code = 'CLOUD_AUTH_REQUIRED' as const;
  constructor() {
    super('Cloud sign-in required');
    this.name = 'CloudAuthRequiredError';
  }
}

export async function requireCloudAuth(): Promise<void> {
  const status = await getCloudStatus();
  if (!status.authed) throw new CloudAuthRequiredError();
}

export async function getCloudStatus(): Promise<CloudStatus> {
  const cfg = await readConfig();
  if (cfg === null) {
    return {
      authed: false,
      baseUrl: null,
      tokenPrefix: null,
      orgId: null,
      signedInAt: null,
      promptDismissed: false,
    };
  }
  const promptDismissed = cfg.prompt_dismissed_at !== null;
  if (cfg.token_id.length === 0) {
    return {
      authed: false,
      baseUrl: null,
      tokenPrefix: null,
      orgId: null,
      signedInAt: null,
      promptDismissed,
    };
  }
  return {
    authed: true,
    baseUrl: cfg.base_url,
    tokenPrefix: cfg.token_prefix,
    orgId: cfg.org_id,
    signedInAt: cfg.signed_in_at,
    promptDismissed,
  };
}

/**
 * Resolves the raw bearer token for outbound calls. Returns null when
 * unsigned-in or when the token is encrypted with safeStorage on a
 * device where decryption is no longer available.
 */
export async function getCloudToken(): Promise<string | null> {
  const cfg = await readConfig();
  if (cfg === null || cfg.token_id.length === 0) return null;
  return decryptToken(cfg.token_buffer_b64, cfg.encryption);
}

export interface CloudLoginStartedOk {
  ok: true;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: number;
  intervalMs: number;
}

export interface CloudLoginStartedErr {
  ok: false;
  error: string;
}

function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // Node's undici fetch always throws TypeError("fetch failed") and
  // hides the real reason on `.cause`. Surface it so a misconfigured
  // base URL, expired DNS, TLS issue, or wrong bypass token is
  // diagnosable from the UI instead of just "fetch failed".
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    return code ? `${err.message}: ${code} ${cause.message}` : `${err.message}: ${cause.message}`;
  }
  return err.message;
}

export async function startCloudLogin(opts?: {
  baseUrl?: string;
}): Promise<CloudLoginStartedOk | CloudLoginStartedErr> {
  const baseUrl = (opts?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  pendingLogin = null;
  const headers = { 'content-type': 'application/json', ...bypassHeader() };
  const haveBypass = 'x-vercel-protection-bypass' in headers;
  console.log('[cloud-auth] startCloudLogin', {
    baseUrl,
    haveBypass,
    bypassEnvLen: (process.env['KANBOTS_CLOUD_BYPASS_TOKEN'] ?? '').length,
  });
  try {
    const res = await fetch(`${baseUrl}/api/v1/agent/devices/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ scope: 'user' }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const snippet = bodyText.slice(0, 200).replace(/\s+/g, ' ');
      console.warn('[cloud-auth] device start failed', {
        baseUrl,
        status: res.status,
        snippet,
      });
      return {
        ok: false,
        error: `device flow start failed (HTTP ${res.status}${snippet ? `: ${snippet}` : ''})`,
      };
    }
    const start = (await res.json()) as DeviceStartResponse;
    pendingLogin = {
      baseUrl,
      deviceCode: start.device_code,
      userCode: start.user_code,
      verificationUri: start.verification_uri,
      verificationUriComplete: start.verification_uri_complete,
      expiresAt: Date.now() + start.expires_in * 1000,
      intervalMs: Math.max(start.interval, 1) * 1000,
      cancelled: false,
    };
    void shell.openExternal(start.verification_uri_complete).catch(() => undefined);
    return {
      ok: true,
      userCode: start.user_code,
      verificationUri: start.verification_uri,
      verificationUriComplete: start.verification_uri_complete,
      expiresAt: pendingLogin.expiresAt,
      intervalMs: pendingLogin.intervalMs,
    };
  } catch (err) {
    const detail = describeFetchError(err);
    console.error('[cloud-auth] device start threw', { baseUrl, detail });
    return { ok: false, error: detail };
  }
}

export type CloudPollResult =
  | { status: 'pending' }
  | { status: 'expired' | 'consumed' | 'cancelled' }
  | { status: 'approved'; tokenPrefix: string; orgId: string | null }
  | { status: 'error'; error: string }
  | { status: 'idle' };

/**
 * Caller (renderer) drives the cadence — call once per `intervalMs`
 * after `startCloudLogin` returns until the result is terminal.
 */
export async function pollCloudLogin(): Promise<CloudPollResult> {
  const p = pendingLogin;
  if (p === null) return { status: 'idle' };
  if (p.cancelled) {
    pendingLogin = null;
    return { status: 'cancelled' };
  }
  if (Date.now() > p.expiresAt) {
    pendingLogin = null;
    return { status: 'expired' };
  }
  try {
    const res = await fetch(`${p.baseUrl}/api/v1/agent/devices/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bypassHeader() },
      body: JSON.stringify({ device_code: p.deviceCode }),
    });
    if (res.status === 410 || res.status === 404) {
      pendingLogin = null;
      return { status: 'expired' };
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const snippet = bodyText.slice(0, 200).replace(/\s+/g, ' ');
      return {
        status: 'error',
        error: `poll failed (HTTP ${res.status}${snippet ? `: ${snippet}` : ''})`,
      };
    }
    const body = (await res.json()) as DevicePollResponse;
    if (body.status === 'pending') return { status: 'pending' };
    if (body.status !== 'approved') {
      pendingLogin = null;
      return { status: body.status };
    }
    pendingLogin = null;
    const tokenPrefix = body.token.slice(0, 12);
    const enc = encryptToken(body.token);
    const cfg: CloudConfigFileV1 = {
      v: 1,
      encryption: enc.encryption,
      token_buffer_b64: enc.buffer_b64,
      base_url: p.baseUrl,
      token_id: body.token_id,
      token_prefix: tokenPrefix,
      org_id: body.org_id,
      signed_in_at: new Date().toISOString(),
      prompt_dismissed_at: new Date().toISOString(),
    };
    await writeConfig(cfg);
    return { status: 'approved', tokenPrefix, orgId: body.org_id };
  } catch (err) {
    return { status: 'error', error: describeFetchError(err) };
  }
}

export function cancelCloudLogin(): void {
  if (pendingLogin !== null) pendingLogin.cancelled = true;
  pendingLogin = null;
}

export async function clearCloudAuth(): Promise<void> {
  cancelCloudLogin();
  try {
    const existing = await readConfig();
    if (existing !== null && existing.prompt_dismissed_at !== null) {
      // Keep the dismissal flag so the user isn't re-prompted after explicit
      // sign-out.
      const stub: CloudConfigPromptOnly = {
        v: 1,
        encryption: 'plain',
        token_buffer_b64: '',
        base_url: '',
        token_id: '',
        token_prefix: '',
        org_id: null,
        signed_in_at: '',
        prompt_dismissed_at: existing.prompt_dismissed_at,
      };
      await writeConfig(stub);
      return;
    }
  } catch {
    /* fall through to outright deletion */
  }
  try {
    await rm(configPath());
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ENOENT') throw e;
  }
}

export async function dismissCloudPrompt(): Promise<void> {
  const existing = await readConfig();
  const now = new Date().toISOString();
  if (existing !== null && existing.token_id.length > 0) {
    const updated: CloudConfigFileV1 = { ...(existing as CloudConfigFileV1), prompt_dismissed_at: now };
    await writeConfig(updated);
    return;
  }
  const stub: CloudConfigPromptOnly = {
    v: 1,
    encryption: 'plain',
    token_buffer_b64: '',
    base_url: '',
    token_id: '',
    token_prefix: '',
    org_id: null,
    signed_in_at: '',
    prompt_dismissed_at: now,
  };
  await writeConfig(stub);
}
