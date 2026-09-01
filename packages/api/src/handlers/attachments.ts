import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { UploadAttachmentResult } from '../bridge.js';
import { badRequest, namedError, parseArgs } from './errors.js';
import type { HandlerDeps } from './types.js';

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
};

const MAX_BYTES = 15 * 1024 * 1024;

const uploadSchema = z
  .object({
    contentType: z.string().min(1).max(120),
    data: z.instanceof(Uint8Array),
  })
  .strict();

export interface UploadArgs {
  contentType: string;
  data: Uint8Array;
}

function attachmentsDir(repoPath: string): string {
  return resolve(repoPath, '.kanbots', 'attachments');
}

export async function upload(
  deps: HandlerDeps,
  args: UploadArgs,
): Promise<UploadAttachmentResult> {
  if (!deps.config.repoPath) {
    throw badRequest('no active workspace; cannot save attachments');
  }
  const parsed = parseArgs(uploadSchema, args);
  const ext = MIME_EXT[parsed.contentType.toLowerCase()];
  if (!ext) {
    throw namedError(
      'UnsupportedMediaType',
      `unsupported content type ${parsed.contentType}`,
    );
  }
  if (parsed.data.byteLength === 0) throw badRequest('empty payload');
  if (parsed.data.byteLength > MAX_BYTES) {
    throw namedError('PayloadTooLarge', `attachment exceeds ${MAX_BYTES} bytes`);
  }

  const dir = attachmentsDir(deps.config.repoPath);
  await mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = randomBytes(4).toString('hex');
  const filename = `${stamp}-${rand}${ext}`;
  const absolutePath = join(dir, filename);
  await writeFile(absolutePath, parsed.data);

  return {
    filename,
    absolutePath,
    relativePath: `.kanbots/attachments/${filename}`,
    size: parsed.data.byteLength,
    contentType: parsed.contentType,
  };
}
