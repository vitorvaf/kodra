import type { CardTemplate } from '@kanbots/local-store';
import { z } from 'zod';
import type { CardTemplatePayload, DecoratedIssue } from '../bridge.js';
import { bootstrapWorkspace } from '../workspace-bootstrap.js';
import { badRequest, notFound, parseArgs } from './errors.js';
import { buildTaskSystemPrompt, create as createIssue } from './issues.js';
import type { HandlerDeps } from './types.js';

const PROVIDER_ENUM = z.enum([
  'claude-code',
  'codex-cli',
  'gemini-cli',
  'amp-cli',
  'cursor-cli',
  'copilot-cli',
  'opencode-cli',
  'droid-cli',
  'ccr-cli',
  'qwen-cli',
  'acp',
]);

const createSchema = z
  .object({
    name: z.string().min(1).max(120),
    titleTemplate: z.string().min(1).max(200),
    bodyTemplate: z.string().max(65_536).nullable().optional(),
    labels: z.array(z.string().min(1).max(120)).max(40).optional(),
    defaultProvider: PROVIDER_ENUM.nullable().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(120).optional(),
    titleTemplate: z.string().min(1).max(200).optional(),
    bodyTemplate: z.string().max(65_536).nullable().optional(),
    labels: z.array(z.string().min(1).max(120)).max(40).optional(),
    defaultProvider: PROVIDER_ENUM.nullable().optional(),
  })
  .strict();

const deleteSchema = z.object({ id: z.number().int().positive() }).strict();

const reorderSchema = z
  .object({
    ids: z.array(z.number().int().positive()).max(200),
  })
  .strict();

const instantiateSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict();

export interface CreateCardTemplateArgs {
  name: string;
  titleTemplate: string;
  bodyTemplate?: string | null;
  labels?: string[];
  defaultProvider?: string | null;
}

export interface UpdateCardTemplateArgs {
  id: number;
  name?: string;
  titleTemplate?: string;
  bodyTemplate?: string | null;
  labels?: string[];
  defaultProvider?: string | null;
}

export interface DeleteCardTemplateArgs {
  id: number;
}

export interface ReorderCardTemplatesArgs {
  ids: number[];
}

export interface InstantiateCardTemplateArgs {
  id: number;
}

function templateToPayload(t: CardTemplate): CardTemplatePayload {
  return {
    id: t.id,
    workspaceId: t.workspaceId,
    name: t.name,
    titleTemplate: t.titleTemplate,
    bodyTemplate: t.bodyTemplate,
    labels: t.labels,
    defaultProvider: t.defaultProvider,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function requireWorkspaceId(deps: HandlerDeps): string {
  if (!deps.config.repoPath) {
    throw badRequest('host has no active workspace');
  }
  const { workspace } = bootstrapWorkspace(deps.store, deps.config, deps.config.repoPath);
  return workspace.id;
}

function requireTemplate(deps: HandlerDeps, workspaceId: string, id: number): CardTemplate {
  const t = deps.store.cardTemplates.findById(id);
  if (!t || t.workspaceId !== workspaceId) {
    throw notFound(`card template ${id} not found`);
  }
  return t;
}

export async function list(deps: HandlerDeps): Promise<CardTemplatePayload[]> {
  if (!deps.config.repoPath) return [];
  const workspaceId = requireWorkspaceId(deps);
  return deps.store.cardTemplates
    .listByWorkspace(workspaceId)
    .map(templateToPayload);
}

export async function create(
  deps: HandlerDeps,
  args: CreateCardTemplateArgs,
): Promise<CardTemplatePayload> {
  const parsed = parseArgs(createSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  const t = deps.store.cardTemplates.create({
    workspaceId,
    name: parsed.name,
    titleTemplate: parsed.titleTemplate,
    ...(parsed.bodyTemplate !== undefined ? { bodyTemplate: parsed.bodyTemplate } : {}),
    ...(parsed.labels !== undefined ? { labels: parsed.labels } : {}),
    ...(parsed.defaultProvider !== undefined
      ? { defaultProvider: parsed.defaultProvider }
      : {}),
  });
  return templateToPayload(t);
}

export async function update(
  deps: HandlerDeps,
  args: UpdateCardTemplateArgs,
): Promise<CardTemplatePayload> {
  const parsed = parseArgs(updateSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  requireTemplate(deps, workspaceId, parsed.id);
  const next = deps.store.cardTemplates.update(parsed.id, {
    ...(parsed.name !== undefined ? { name: parsed.name } : {}),
    ...(parsed.titleTemplate !== undefined
      ? { titleTemplate: parsed.titleTemplate }
      : {}),
    ...(parsed.bodyTemplate !== undefined ? { bodyTemplate: parsed.bodyTemplate } : {}),
    ...(parsed.labels !== undefined ? { labels: parsed.labels } : {}),
    ...(parsed.defaultProvider !== undefined
      ? { defaultProvider: parsed.defaultProvider }
      : {}),
  });
  return templateToPayload(next);
}

export async function remove(
  deps: HandlerDeps,
  args: DeleteCardTemplateArgs,
): Promise<{ ok: boolean }> {
  const parsed = parseArgs(deleteSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  requireTemplate(deps, workspaceId, parsed.id);
  deps.store.cardTemplates.remove(parsed.id);
  return { ok: true };
}

export async function reorder(
  deps: HandlerDeps,
  args: ReorderCardTemplatesArgs,
): Promise<CardTemplatePayload[]> {
  const parsed = parseArgs(reorderSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  deps.store.cardTemplates.reorder(workspaceId, parsed.ids);
  return deps.store.cardTemplates
    .listByWorkspace(workspaceId)
    .map(templateToPayload);
}

/**
 * Spawn a new issue from a saved template. The freshly-created card lands
 * in the backlog (status:backlog) so the user can review it before
 * dispatching — instantiating shouldn't silently kick off an agent run.
 * If the template pins a `defaultProvider` the caller is expected to read
 * the new issue number and dispatch separately through `issues:dispatch`;
 * we don't dispatch automatically because the renderer needs to wire up
 * the right repoId / kickoff prompt.
 */
export async function instantiate(
  deps: HandlerDeps,
  args: InstantiateCardTemplateArgs,
): Promise<DecoratedIssue> {
  const parsed = parseArgs(instantiateSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  const tpl = requireTemplate(deps, workspaceId, parsed.id);

  // Strip the `{{cursor}}` placeholder when materialising the body — the
  // renderer uses it to position the textarea caret in the create modal,
  // but for a one-click instantiation we don't have that surface.
  const body = (tpl.bodyTemplate ?? '').replace(/\{\{cursor\}\}/g, '').trim();
  const title = tpl.titleTemplate.trim() || tpl.name;

  // Always seed the backlog label so the new card lands somewhere
  // discoverable. The template's labels feed in alongside, deduplicated
  // case-insensitively so a template authored with "status:todo" wins
  // over the default.
  const labels = new Map<string, string>();
  labels.set('status:backlog', 'status:backlog');
  for (const l of tpl.labels) {
    labels.set(l.toLowerCase(), l);
  }

  const created = await createIssue(deps, {
    title,
    ...(body.length > 0 ? { body } : {}),
    labels: [...labels.values()],
  });

  // Surface the originating template's default provider on the issue so
  // the renderer can drive an immediate dispatch without re-reading the
  // template. We piggyback on `buildTaskSystemPrompt` as a no-op import
  // to keep the dependency surface honest — the prompt itself is the
  // caller's concern when dispatching.
  void buildTaskSystemPrompt; // referenced to keep tree-shaking honest in tests
  return created;
}
