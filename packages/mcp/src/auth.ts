import { readFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

// Cloud sign-in is OPTIONAL for the MCP server. The server starts in
// local-only mode by default; cloud features become available when the
// desktop app has written a `cloud-config.json` with a valid token. This
// module reads that config (if any) and returns a structured status so
// individual tool handlers can decide whether to require cloud.
//
// Duplicated rather than shared with packages/desktop to keep this
// package's dependency surface tiny (only @modelcontextprotocol/sdk).
function userDataDir(): string {
  const product = 'kanbots';
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', product);
    case 'win32':
      return join(process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), product);
    default:
      return join(process.env['XDG_CONFIG_HOME'] ?? join(home, '.config'), product);
  }
}

interface MinimalCloudConfig {
  v?: unknown;
  token_id?: unknown;
}

export interface CloudSession {
  signedIn: boolean;
}

export const CLOUD_SIGNIN_HINT =
  'Sign in via the Kanbots desktop app to enable cloud features.';

/**
 * Read the cloud session status from `cloud-config.json`. Never throws and
 * never exits the process. Returns `{ signedIn: false }` if the file is
 * missing, malformed, or contains no valid token; `{ signedIn: true }`
 * only when a v1 config with a non-empty `token_id` is present.
 */
export async function readCloudSession(): Promise<CloudSession> {
  const path = join(userDataDir(), 'cloud-config.json');
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as MinimalCloudConfig;
    if (parsed.v === 1 && typeof parsed.token_id === 'string' && parsed.token_id.length > 0) {
      return { signedIn: true };
    }
  } catch {
    // Missing or unreadable config is treated as "not signed in".
  }
  return { signedIn: false };
}

/**
 * Throws a tagged error if there is no cloud session. Intended for use
 * inside cloud-only MCP tool handlers; the server entrypoint must NOT
 * call this — the gate is per-tool, not per-server.
 */
export async function requireCloudSession(): Promise<void> {
  const session = await readCloudSession();
  if (!session.signedIn) {
    throw new CloudAuthRequiredError(CLOUD_SIGNIN_HINT);
  }
}

export class CloudAuthRequiredError extends Error {
  constructor(message: string = CLOUD_SIGNIN_HINT) {
    super(message);
    this.name = 'CloudAuthRequiredError';
  }
}
