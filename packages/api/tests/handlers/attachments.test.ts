import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

describe('attachments:upload', () => {
  it('writes the bytes and returns metadata', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'kanbots-attach-'));
    const { handlers } = makeHandlerTestKit({ repoPath });
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
    const result = await handlers['attachments:upload']({
      contentType: 'image/png',
      data,
    });
    expect(result.size).toBe(4);
    expect(result.contentType).toBe('image/png');
    expect(result.filename.endsWith('.png')).toBe(true);
  });

  it('rejects an empty payload via validation', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'kanbots-attach-'));
    const { handlers } = makeHandlerTestKit({ repoPath });
    await expect(
      handlers['attachments:upload']({
        contentType: 'image/png',
        data: new Uint8Array(0),
      }),
    ).rejects.toThrow();
  });
});
