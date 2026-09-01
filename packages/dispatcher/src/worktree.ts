import { execFile } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const AGENT_BRANCH_PREFIX = 'refs/heads/kanbots/issue-';

const PRE_PUSH_HOOK = `#!/bin/sh
# Installed by kanbots to block pushes of agent worktree branches.
# Git treats hooks/ as shared across worktrees, so this file may end up
# in the main repo's .git/hooks/. The branch-name guard below keeps it
# harmless for normal work — only refs matching '${AGENT_BRANCH_PREFIX}*'
# are rejected. Humans can still bypass with \`git push --no-verify\`.
while read -r local_ref local_sha remote_ref remote_sha; do
  case "$local_ref" in
    ${AGENT_BRANCH_PREFIX}*)
      echo "kanbots: agent worktree branch '$local_ref' cannot be pushed; commit locally and let the human review." 1>&2
      exit 1
      ;;
  esac
done
exit 0
`;

async function hardenWorktree(worktreePath: string): Promise<void> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--git-path', 'hooks'], {
    cwd: worktreePath,
  });
  const hooksRel = stdout.trim();
  if (!hooksRel) throw new Error('git rev-parse --git-path hooks returned empty');
  const hooksDir = isAbsolute(hooksRel) ? hooksRel : resolve(worktreePath, hooksRel);
  await mkdir(hooksDir, { recursive: true });
  const hookPath = resolve(hooksDir, 'pre-push');
  await writeFile(hookPath, PRE_PUSH_HOOK, { mode: 0o755 });
  await chmod(hookPath, 0o755);
}

export interface CreateWorktreeInput {
  repoPath: string;
  branch: string;
  worktreePath: string;
  baseRef?: string;
}

export interface Worktree {
  branch: string;
  path: string;
  baseRef: string | null;
}

export async function createWorktree(input: CreateWorktreeInput): Promise<Worktree> {
  const args = ['worktree', 'add', '-b', input.branch, input.worktreePath];
  if (input.baseRef) args.push(input.baseRef);
  await execFileAsync('git', args, { cwd: input.repoPath });
  try {
    await hardenWorktree(input.worktreePath);
  } catch (err) {
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', input.worktreePath], {
        cwd: input.repoPath,
      });
    } catch {
      // best-effort cleanup; surface the original hardening error below
    }
    throw err;
  }
  return {
    branch: input.branch,
    path: input.worktreePath,
    baseRef: input.baseRef ?? null,
  };
}

export interface RemoveWorktreeInput {
  repoPath: string;
  worktreePath: string;
  force?: boolean;
}

export async function removeWorktree(input: RemoveWorktreeInput): Promise<void> {
  const args = ['worktree', 'remove'];
  if (input.force) args.push('--force');
  args.push(input.worktreePath);
  await execFileAsync('git', args, { cwd: input.repoPath });
}

export function defaultWorktreePath(opts: {
  repoPath: string;
  issueNumber: number;
  runId: number;
}): string {
  return `${opts.repoPath}/.kanbots/worktrees/issue-${opts.issueNumber}-${opts.runId}`;
}

export function defaultBranchName(opts: { issueNumber: number; runId: number }): string {
  return `kanbots/issue-${opts.issueNumber}-${opts.runId}`;
}
