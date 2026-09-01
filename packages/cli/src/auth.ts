import { readFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

// The desktop writes its Kanbots Cloud session at the Electron `userData`
// path for product name "kanbots". Mirror Electron's per-platform defaults
// so the CLI can detect (but no longer require) a cloud session. The CLI
// runs locally without a session; only cloud-specific subcommands opt in
// to `requireCloudAuth()` and bail when no session is present.
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
  signedIn: true;
  tokenId: string;
}

/**
 * Reads the cloud session config from disk if present. Returns `null` when
 * the user has not signed in via the desktop app. Never throws and never
 * exits — callers decide what to do with a missing session.
 *
 * The CLI cannot decrypt safeStorage-protected tokens; the presence of a
 * non-empty `token_id` is sufficient to mark the user as signed in. The
 * desktop performs real validation when commands route through the bridge.
 */
export async function getCloudSession(): Promise<CloudSession | null> {
  const path = join(userDataDir(), 'cloud-config.json');
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as MinimalCloudConfig;
    if (parsed.v !== 1 || typeof parsed.token_id !== 'string' || parsed.token_id.length === 0) {
      return null;
    }
    return { signedIn: true, tokenId: parsed.token_id };
  } catch {
    return null;
  }
}

/**
 * Opt-in guard for cloud-dependent subcommands. Prints a clear sign-in
 * message and exits non-zero when no session exists. Local-only commands
 * must NOT call this — the CLI is usable without a cloud session.
 */
export async function requireCloudAuth(): Promise<CloudSession> {
  const session = await getCloudSession();
  if (session === null) {
    process.stderr.write(
      'kanbots: this command requires Kanbots Cloud.\n' +
        '  Sign in via the desktop app or run `kanbots login` to enable cloud features.\n',
    );
    process.exit(2);
  }
  return session;
}
