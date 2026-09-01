import type { PendingDecisionPayload } from '../bridge.js';
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
