import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const REMOTE_PROBE_ORDER = ['main', 'master', 'origin/main', 'origin/master'] as const;

export type RefExists = (ref: string) => Promise<boolean>;
export type GitExecutor = (args: string[]) => Promise<{ stdout: string }>;

export type BaseRefSource =
  | 'explicit'
  | 'repo-target'
  | 'folder'
  | 'remote-head'
  | 'probe'
  | 'head';

export interface BaseRefResolution {
  ref: string | null;
  source: BaseRefSource;
}

export interface ResolveBaseRefInput {
  explicit?: string | null | undefined;
  repoTarget?: string | null;
  folderDefault?: string | null;
  refExists: RefExists;
  execGit: GitExecutor;
}

export async function pickFirstExisting(
  candidates: string[],
  refExists: RefExists,
): Promise<string | null> {
  for (const candidate of candidates) {
    const ref = candidate.trim();
    if (!ref) continue;
    if (await refExists(ref)) return ref;
  }
  return null;
}

export async function resolveRemoteHead(execGit: GitExecutor): Promise<string | null> {
  try {
    const { stdout } = await execGit([
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD',
    ]);
    const ref = stdout.trim();
    if (!ref) return null;
    return ref.replace(/^refs\/remotes\//, '');
  } catch {
    return null;
  }
}

export async function resolveBaseRef(input: ResolveBaseRefInput): Promise<BaseRefResolution> {
  const explicit = await pickFirstExisting(
    [input.explicit ?? ''],
    input.refExists,
  );
  if (explicit !== null) return { ref: explicit, source: 'explicit' };

  const repoTarget = await pickFirstExisting([input.repoTarget ?? ''], input.refExists);
  if (repoTarget !== null) return { ref: repoTarget, source: 'repo-target' };

  const folder = await pickFirstExisting([input.folderDefault ?? ''], input.refExists);
  if (folder !== null) return { ref: folder, source: 'folder' };

  const remoteHead = await resolveRemoteHead(input.execGit);
  if (remoteHead !== null && (await input.refExists(remoteHead))) {
    return { ref: remoteHead, source: 'remote-head' };
  }

  const probe = await pickFirstExisting([...REMOTE_PROBE_ORDER], input.refExists);
  if (probe !== null) return { ref: probe, source: 'probe' };

  return { ref: null, source: 'head' };
}

export function createGitRefExists(repoPath: string): RefExists {
  return async (ref: string): Promise<boolean> => {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', '--quiet', ref], {
        cwd: repoPath,
      });
      return true;
    } catch {
      return false;
    }
  };
}

export function createGitExecutor(repoPath: string): GitExecutor {
  return async (args: string[]): Promise<{ stdout: string }> => {
    const { stdout } = await execFileAsync('git', args, { cwd: repoPath });
    return { stdout };
  };
}
