import { z } from 'zod';

/** Issue references accepted by local and GitHub-backed handler lookups. */
export const issueRefSchema = z.union([
  z.number().int().positive(),
  z.string().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
]);
