import { z } from 'zod';
import type { Learning, LearningTag } from '@kanbots/local-store';
import { badRequest, notFound, parseArgs } from './errors.js';
import type { HandlerDeps } from './types.js';

const VALID_TAGS = ['convention', 'gotcha', 'fragile', 'decision-rationale'] as const;

const listSchema = z
  .object({
    repoOwner: z.string().min(1),
    repoName: z.string().min(1),
    includeDeleted: z.boolean().optional(),
    tag: z.enum(VALID_TAGS).optional(),
    limit: z.number().int().positive().max(500).optional(),
  })
  .strict();

const idSchema = z.object({ id: z.number().int().positive() }).strict();

const updateSchema = z
  .object({
    id: z.number().int().positive(),
    content: z.string().min(10).max(2000),
  })
  .strict();

const pinSchema = z
  .object({
    id: z.number().int().positive(),
    pinned: z.boolean(),
  })
  .strict();

export type ListLearningsArgs = z.infer<typeof listSchema>;
export type DeleteLearningArgs = z.infer<typeof idSchema>;
export type UpdateLearningArgs = z.infer<typeof updateSchema>;
export type PinLearningArgs = z.infer<typeof pinSchema>;

export async function list(deps: HandlerDeps, args: ListLearningsArgs): Promise<Learning[]> {
  const parsed = parseArgs(listSchema, args);
  const input: Parameters<typeof deps.store.learnings.listAll>[0] = {
    repoOwner: parsed.repoOwner,
    repoName: parsed.repoName,
  };
  if (typeof parsed.includeDeleted === 'boolean') input.includeDeleted = parsed.includeDeleted;
  if (parsed.tag) input.tag = parsed.tag as LearningTag;
  if (parsed.limit) input.limit = parsed.limit;
  return deps.store.learnings.listAll(input);
}

export async function deleteLearning(
  deps: HandlerDeps,
  args: DeleteLearningArgs,
): Promise<Learning> {
  const parsed = parseArgs(idSchema, args);
  const existing = deps.store.learnings.findById(parsed.id);
  if (!existing) throw notFound(`learning ${parsed.id} not found`);
  return deps.store.learnings.softDelete(parsed.id);
}

export async function update(
  deps: HandlerDeps,
  args: UpdateLearningArgs,
): Promise<Learning> {
  const parsed = parseArgs(updateSchema, args);
  const existing = deps.store.learnings.findById(parsed.id);
  if (!existing) throw notFound(`learning ${parsed.id} not found`);
  if (existing.deletedAt !== null) {
    throw badRequest('cannot edit a deleted learning');
  }
  return deps.store.learnings.updateContent(parsed.id, parsed.content);
}

export async function pin(deps: HandlerDeps, args: PinLearningArgs): Promise<Learning> {
  const parsed = parseArgs(pinSchema, args);
  const existing = deps.store.learnings.findById(parsed.id);
  if (!existing) throw notFound(`learning ${parsed.id} not found`);
  return deps.store.learnings.pin(parsed.id, parsed.pinned);
}
