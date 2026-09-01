import {
  agentFromLabels,
  statusFromLabels,
  withAgentLabel,
  withStatusLabel,
  type IssueSource,
} from '@kanbots/core';
import type { Store } from '@kanbots/local-store';

export interface ReconcileLabelsResult {
  demoted: number[];
}

/**
 * After the supervisor sweep, any issue still labeled `status:in-progress` or
 * `agent:running`/`agent:blocked` without an active agent run is stale.
 * Demote status → todo and agent → idle so the board reflects reality.
 *
 * `awaiting_input` runs count as active — those legitimately keep the issue
 * in progress until the user responds.
 */
export async function reconcileIssueLabels(
  source: IssueSource,
  store: Store,
  repoOwner: string,
  repoName: string,
): Promise<ReconcileLabelsResult> {
  const activeIssueNumbers = new Set(
    store.agentRuns
      .listActiveForRepo(repoOwner, repoName)
      .map((r) => r.issueNumber),
  );

  const issues = await source.listIssues({ state: 'open' });
  const demoted: number[] = [];

  for (const issue of issues) {
    if (activeIssueNumbers.has(issue.number)) continue;
    const status = statusFromLabels(issue.labels);
    const agent = agentFromLabels(issue.labels);
    const stuckStatus = status === 'inProgress';
    const stuckAgent = agent === 'running' || agent === 'blocked';
    if (!stuckStatus && !stuckAgent) continue;
    let labels: string[] = [...issue.labels];
    if (stuckStatus) labels = withStatusLabel(labels, 'todo');
    if (stuckAgent) labels = withAgentLabel(labels, 'idle');
    try {
      await source.updateIssue(issue.number, { labels });
      demoted.push(issue.number);
    } catch {
      // Best-effort — don't block workspace open on a bad row.
    }
  }
  return { demoted };
}
