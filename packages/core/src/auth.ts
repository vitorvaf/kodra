import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { KanbotsAuthError } from './errors.js';

const execFileAsync = promisify(execFile);

export interface AuthDeps {
  runGhCli?: () => Promise<string | null>;
  readEnv?: (key: string) => string | undefined;
  readTokenFile?: () => Promise<string | null>;
}

export async function resolveGitHubToken(deps: AuthDeps = {}): Promise<string> {
  const runGh = deps.runGhCli ?? defaultRunGhCli;
  const readEnv = deps.readEnv ?? ((key) => process.env[key]);
  const readTokenFile = deps.readTokenFile ?? defaultReadTokenFile;

  const fromGh = await runGh();
  if (fromGh) return fromGh;

  const fromEnv = readEnv('GITHUB_TOKEN');
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const fromFile = await readTokenFile();
  if (fromFile) return fromFile;

  throw new KanbotsAuthError(
    [
      'No GitHub token found. Try one of:',
      '  - Run `gh auth login` (recommended)',
      '  - Set GITHUB_TOKEN environment variable',
      '  - Write a token to ~/.kanbots/token',
    ].join('\n'),
  );
}

async function defaultRunGhCli(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { encoding: 'utf-8' });
    const trimmed = stdout.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export const TOKEN_FILE_PATH = join(homedir(), '.kanbots', 'token');

async function defaultReadTokenFile(): Promise<string | null> {
  try {
    const content = await readFile(TOKEN_FILE_PATH, 'utf-8');
    const trimmed = content.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}
