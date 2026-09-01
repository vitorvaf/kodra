import { statusFromLabels, type Issue } from '@kanbots/core';
import type { IssueRelation } from '@kanbots/local-store';
import { z } from 'zod';
import type { IssueRelationPayload } from '../bridge.js';
import { bootstrapWorkspace } from '../workspace-bootstrap.js';
import { badRequest, notFound, parseArgs } from './errors.js';
import type { HandlerDeps } from './types.js';

/**
 * Max depth the cycle check walks when verifying that a new parent
 * isn't already a descendant of the candidate child. Matches the bound
 * the repo class uses in `findRoot` / `listAncestors` so the cycle
 * check covers the same chain a real lookup would walk.
 */
const MAX_CYCLE_DEPTH = 16;

const listChildrenSchema = z
  .object({ parentNumber: z.number().int().positive() })
  .strict();

const listParentsSchema = z
  .object({ childNumber: z.number().int().positive() })
  .strict();

const addSchema = z
  .object({
    parentNumber: z.number().int().positive(),
    childNumber: z.number().int().positive(),
  })
  .strict();

const removeSchema = z.object({ id: z.number().int().positive() }).strict();

export interface ListChildrenArgs {
  parentNumber: number;
}

export interface ListParentsArgs {
  childNumber: number;
}

export interface AddRelationArgs {
  parentNumber: number;
  childNumber: number;
}

export interface RemoveRelationArgs {
  id: number;
}

function requireWorkspaceId(deps: HandlerDeps): string {
  if (!deps.config.repoPath) {
    throw badRequest('host has no active workspace');
  }
  const { workspace } = bootstrapWorkspace(
    deps.store,
    deps.config,
    deps.config.repoPath,
  );
  return workspace.id;
}

/**
 * Resolves an issue by number using the source layer. Returns `null`
 * if the source raises — the source's getIssue throws for missing
 * issues, but we treat that as "no longer exists" so the renderer can
 * still surface the relation row (with a placeholder title) rather
 * than fail to render the whole sub-issues section.
 */
async function tryGetIssue(
  deps: HandlerDeps,
  number: number,
): Promise<Issue | null> {
  try {
    return await deps.source.getIssue(number);
  } catch {
    return null;
  }
}

function relationToPayload(rel: IssueRelation, child: Issue | null): IssueRelationPayload {
  const fallbackTitle = `#${rel.childNumber} (not found)`;
  return {
    id: rel.id,
    parentNumber: rel.parentNumber,
    childNumber: rel.childNumber,
    child: {
      number: rel.childNumber,
      title: child?.title ?? fallbackTitle,
      status: child ? statusFromLabels(child.labels) : null,
      state: child?.state ?? 'open',
    },
    createdAt: rel.createdAt,
  };
}

async function enrich(
  deps: HandlerDeps,
  relations: IssueRelation[],
  numberKey: 'childNumber' | 'parentNumber',
): Promise<IssueRelationPayload[]> {
  if (relations.length === 0) return [];
  // Fetch each referenced issue in parallel. The renderer-side
  // sub-issues list is typically small (single digits) so this stays
  // cheap; if a particular issue resolves to null the row is rendered
  // with a placeholder.
  const issues = await Promise.all(
    relations.map((r) => tryGetIssue(deps, r[numberKey])),
  );
  return relations.map((rel, i) => {
    // For the "list children" call the child issue lives at index i.
    // For "list parents" we still want to display the *parent's* title
    // in the payload's `child` field — the caller-facing shape stays
    // identical, the payload simply mirrors whichever side of the link
    // is the "other" issue. We make that explicit by relying on
    // `numberKey` matching the side we fetched above.
    const resolved = issues[i] ?? null;
    if (numberKey === 'parentNumber') {
      // Build a payload where `child` actually carries the parent's
      // info. The caller (renderer) sees the field name as
      // "the other issue's details" — it's `child` in the type
      // because the natural-language description of a sub-issue link
      // is parent → child, but in list-parents we surface the parent
      // metadata. To keep the type honest we override `child.number`
      // to the parent number; callers can still tell which side they
      // queried because they kept their original `childNumber` arg.
      return {
        id: rel.id,
        parentNumber: rel.parentNumber,
        childNumber: rel.childNumber,
        child: {
          number: rel.parentNumber,
          title: resolved?.title ?? `#${rel.parentNumber} (not found)`,
          status: resolved ? statusFromLabels(resolved.labels) : null,
          state: resolved?.state ?? 'open',
        },
        createdAt: rel.createdAt,
      };
    }
    return relationToPayload(rel, resolved);
  });
}

export async function listChildren(
  deps: HandlerDeps,
  args: ListChildrenArgs,
): Promise<IssueRelationPayload[]> {
  const parsed = parseArgs(listChildrenSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  const rels = deps.store.issueRelations.listChildren(workspaceId, parsed.parentNumber);
  return enrich(deps, rels, 'childNumber');
}

export async function listParents(
  deps: HandlerDeps,
  args: ListParentsArgs,
): Promise<IssueRelationPayload[]> {
  const parsed = parseArgs(listParentsSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  const rels = deps.store.issueRelations.listParents(workspaceId, parsed.childNumber);
  return enrich(deps, rels, 'parentNumber');
}

export async function add(
  deps: HandlerDeps,
  args: AddRelationArgs,
): Promise<IssueRelationPayload> {
  const parsed = parseArgs(addSchema, args);
  if (parsed.parentNumber === parsed.childNumber) {
    throw badRequest('an issue cannot be its own sub-issue');
  }
  const workspaceId = requireWorkspaceId(deps);

  // Validate both endpoints exist in the current source before
  // recording the link. We don't want a "Parent: #999" link pointing
  // at an issue that was never created — the renderer would render an
  // un-followable row.
  const parent = await tryGetIssue(deps, parsed.parentNumber);
  if (!parent) {
    throw notFound(`issue #${parsed.parentNumber} not found`);
  }
  const child = await tryGetIssue(deps, parsed.childNumber);
  if (!child) {
    throw notFound(`issue #${parsed.childNumber} not found`);
  }

  // Cycle prevention: refuse the relation if `parentNumber` already
  // appears among the *ancestors* of `childNumber`. Walking from the
  // candidate parent upward checks every existing chain whose end
  // would loop back into itself once the new link is inserted.
  let cursor: number | null = parsed.parentNumber;
  const seen = new Set<number>();
  for (let i = 0; i < MAX_CYCLE_DEPTH && cursor !== null; i++) {
    if (cursor === parsed.childNumber) {
      throw badRequest(
        `linking #${parsed.parentNumber} as a parent of #${parsed.childNumber} would create a cycle`,
      );
    }
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const ancestorRels: IssueRelation[] = deps.store.issueRelations.listParents(
      workspaceId,
      cursor,
    );
    cursor = ancestorRels[0]?.parentNumber ?? null;
  }

  let rel: IssueRelation;
  try {
    rel = deps.store.issueRelations.add({
      workspaceId,
      parentNumber: parsed.parentNumber,
      childNumber: parsed.childNumber,
    });
  } catch (err) {
    // The UNIQUE constraint trips here if the user clicks "link" twice
    // in quick succession — surface a friendlier error than the raw
    // SQLITE_CONSTRAINT message.
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      throw badRequest(
        `#${parsed.childNumber} is already a sub-issue of #${parsed.parentNumber}`,
      );
    }
    throw err;
  }
  return relationToPayload(rel, child);
}

export async function remove(
  deps: HandlerDeps,
  args: RemoveRelationArgs,
): Promise<{ ok: boolean }> {
  const parsed = parseArgs(removeSchema, args);
  const workspaceId = requireWorkspaceId(deps);
  const existing = deps.store.issueRelations.findById(parsed.id);
  if (!existing || existing.workspaceId !== workspaceId) {
    throw notFound(`issue relation ${parsed.id} not found`);
  }
  deps.store.issueRelations.remove(parsed.id);
  return { ok: true };
}
