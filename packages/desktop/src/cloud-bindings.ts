/**
 * Per-cloud-project local repo bindings. When a user dispatches an
 * agent run on a cloud card, the supervisor needs a real git
 * worktree to operate on. This module remembers, per (orgSlug,
 * projectSlug), which local path the user picked so they don't get
 * prompted on every run.
 *
 * Stored at app.getPath('userData')/cloud-project-bindings.json —
 * separate from cloud-config.json (which holds the bearer token)
 * so future migrations can evolve them independently.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app } from 'electron';

interface CloudProjectBindingsFile {
  v: 1;
  /** Keyed by `${orgSlug}/${projectSlug}`. */
  bindings: Record<string, { localRepoPath: string; updatedAt: string }>;
}

export interface CloudProjectBinding {
  localRepoPath: string;
  updatedAt: string;
}

function bindingsPath(): string {
  return join(app.getPath('userData'), 'cloud-project-bindings.json');
}

function key(orgSlug: string, projectSlug: string): string {
  return `${orgSlug}/${projectSlug}`;
}

async function readFileSafe(): Promise<CloudProjectBindingsFile> {
  try {
    const raw = await readFile(bindingsPath(), 'utf8');
    const parsed = JSON.parse(raw) as CloudProjectBindingsFile;
    if (parsed.v !== 1 || typeof parsed.bindings !== 'object' || parsed.bindings === null) {
      return { v: 1, bindings: {} };
    }
    return parsed;
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      return { v: 1, bindings: {} };
    }
    return { v: 1, bindings: {} };
  }
}

async function writeFileAtomic(file: CloudProjectBindingsFile): Promise<void> {
  const path = bindingsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(file, null, 2), { mode: 0o600 });
}

export async function getCloudProjectBinding(
  orgSlug: string,
  projectSlug: string,
): Promise<CloudProjectBinding | null> {
  const file = await readFileSafe();
  const found = file.bindings[key(orgSlug, projectSlug)];
  return found ?? null;
}

export async function setCloudProjectBinding(
  orgSlug: string,
  projectSlug: string,
  localRepoPath: string,
): Promise<CloudProjectBinding> {
  const file = await readFileSafe();
  const entry: CloudProjectBinding = {
    localRepoPath,
    updatedAt: new Date().toISOString(),
  };
  file.bindings[key(orgSlug, projectSlug)] = entry;
  await writeFileAtomic(file);
  return entry;
}

export async function clearCloudProjectBinding(
  orgSlug: string,
  projectSlug: string,
): Promise<void> {
  const file = await readFileSafe();
  delete file.bindings[key(orgSlug, projectSlug)];
  await writeFileAtomic(file);
}
