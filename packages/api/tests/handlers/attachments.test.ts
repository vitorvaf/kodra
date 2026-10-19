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

  it('uses a JSON extension for application/json uploads', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'kanbots-attach-'));
    const { handlers } = makeHandlerTestKit({ repoPath });
    const result = await handlers['attachments:upload']({
      contentType: 'application/json',
      data: new Uint8Array([0x7b, 0x7d]),
    });
    expect(result.filename.endsWith('.json')).toBe(true);
  });

  it('uses an XML extension for text/xml uploads', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'kanbots-attach-'));
    const { handlers } = makeHandlerTestKit({ repoPath });
    const result = await handlers['attachments:upload']({
      contentType: 'text/xml',
      data: new Uint8Array([0x3c, 0x78, 0x2f, 0x3e]),
    });
    expect(result.filename.endsWith('.xml')).toBe(true);
  });

  it('rejects application/pdf as unsupported media', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'kanbots-attach-'));
    const { handlers } = makeHandlerTestKit({ repoPath });
    await expect(
      handlers['attachments:upload']({
        contentType: 'application/pdf',
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      }),
    ).rejects.toMatchObject({ name: 'UnsupportedMediaType' });
  });
});
