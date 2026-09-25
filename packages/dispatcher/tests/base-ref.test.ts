import { describe, expect, it } from 'vitest';
import {
  pickFirstExisting,
  resolveBaseRef,
  resolveRemoteHead,
  type GitExecutor,
} from '../src/base-ref.js';

function resolverInput(overrides: Partial<Parameters<typeof resolveBaseRef>[0]> = {}) {
  return {
    refExists: async (ref: string) => ref === 'main',
    execGit: async () => ({ stdout: '' }),
    ...overrides,
  };
}

describe('base ref resolution', () => {
  it('picks the first existing explicit candidate', async () => {
    const result = await resolveBaseRef(
      resolverInput({
        explicit: 'explicit',
        repoTarget: 'main',
        refExists: async (ref) => ref === 'explicit' || ref === 'main',
      }),
    );

    expect(result).toEqual({ ref: 'explicit', source: 'explicit' });
  });

  it('skips empty and whitespace candidates', async () => {
    const seen: string[] = [];
    const result = await pickFirstExisting(['', '  ', ' main '], async (ref) => {
      seen.push(ref);
      return ref === 'main';
    });

    expect(result).toBe('main');
    expect(seen).toEqual(['main']);
  });

  it('uses a valid remote HEAD before probes', async () => {
    const result = await resolveBaseRef(
      resolverInput({
        execGit: (async () => ({ stdout: 'origin/develop\n' })) as GitExecutor,
        refExists: async (ref) => ref === 'origin/develop' || ref === 'main',
      }),
    );

    expect(result).toEqual({ ref: 'origin/develop', source: 'remote-head' });
  });

  it('uses probes in the documented order', async () => {
    const seen: string[] = [];
    const result = await resolveBaseRef(
      resolverInput({
        refExists: async (ref) => {
          seen.push(ref);
          return ref === 'origin/main';
        },
      }),
    );

    expect(result).toEqual({ ref: 'origin/main', source: 'probe' });
    expect(seen).toEqual(['main', 'master', 'origin/main']);
  });

  it('returns head when no ref exists', async () => {
    const result = await resolveBaseRef(
      resolverInput({ refExists: async () => false }),
    );

    expect(result).toEqual({ ref: null, source: 'head' });
  });

  it('reports repo-target and folder provenance', async () => {
    await expect(
      resolveBaseRef(
        resolverInput({
          repoTarget: 'target',
          refExists: async (ref) => ref === 'target',
        }),
      ),
    ).resolves.toEqual({ ref: 'target', source: 'repo-target' });
    await expect(
      resolveBaseRef(
        resolverInput({
          folderDefault: 'folder',
          refExists: async (ref) => ref === 'folder',
        }),
      ),
    ).resolves.toEqual({ ref: 'folder', source: 'folder' });
  });

  it('returns null when remote HEAD lookup fails', async () => {
    await expect(resolveRemoteHead(async () => Promise.reject(new Error('no remote')))).resolves.toBe(
      null,
    );
  });
});
