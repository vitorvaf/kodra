import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describeKanbotsDir } from '@kanbots/local-store';
import { z } from 'zod';
import type { PendingDecisionPayload } from '../bridge.js';
import { parseArgs } from './errors.js';
import { issueRefSchema } from '../issue-ref.js';
import type { IssueRef } from '@kanbots/core';
import type { HandlerDeps } from './types.js';

export async function pending(
  deps: HandlerDeps,
): Promise<PendingDecisionPayload[]> {
  const rows = deps.store.cards.listPendingForRepo(
    deps.config.owner,
    deps.config.repo,
  );
  const out: PendingDecisionPayload[] = [];
  for (const { card, agentRunId, issueNumber } of rows) {
    const payload = card.payload as
      | { question?: string; options?: Array<{ value?: string; label?: string }> }
      | undefined;
    if (
      !payload ||
      typeof payload.question !== 'string' ||
      !Array.isArray(payload.options)
    ) {
      continue;
    }
    const options = payload.options
      .filter(
        (o): o is { value: string; label: string } =>
          typeof o?.value === 'string' && typeof o?.label === 'string',
      )
      .map((o) => ({ value: o.value, label: o.label }));
    if (options.length === 0) continue;
    out.push({
      cardId: card.id,
      runId: agentRunId,
      issueNumber,
      question: payload.question,
      options,
      createdAt: card.resolvedAt ?? new Date().toISOString(),
    });
  }
  return out;
}

const specsGetSchema = z
  .object({ issueNumber: issueRefSchema })
  .strict();

export async function getSpec(
  deps: HandlerDeps,
  args: { issueNumber: IssueRef },
): Promise<{ content: string | null }> {
  const parsed = parseArgs(specsGetSchema, args);
  if (!deps.config.repoPath) return { content: null };
  const path = join(
    describeKanbotsDir(deps.config.repoPath).root,
    'specs',
    `${parsed.issueNumber}.md`,
  );
  try {
    return { content: await readFile(path, 'utf8') };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { content: null };
    throw err;
  }
}
