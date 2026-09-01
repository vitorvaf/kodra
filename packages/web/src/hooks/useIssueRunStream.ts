import { getCloudCtx } from '../api.js';
import type { AgentRun } from '../types.js';
import { useAgentRunStream, type AgentRunStreamState } from './useAgentRunStream.js';
import { useCloudRunStream } from './useCloudRunStream.js';

/**
 * Mode-aware run stream. In local mode subscribes to the supervisor IPC
 * channel; in cloud mode opens an SSE subscription against the cloud
 * project's run-events endpoint. Returns the same `AgentRunStreamState`
 * either way so callers (OverviewTab, ThreadTab) don't have to branch.
 */
export function useIssueRunStream(
  displayRun: AgentRun | null,
  cloudRunId: string | null,
): AgentRunStreamState {
  const ctx = getCloudCtx();
  // Both hooks are always called to satisfy rules-of-hooks. They idle
  // when their respective id is null, so the unused branch costs ~nothing.
  const local = useAgentRunStream(displayRun?.id ?? null);
  const cloud = useCloudRunStream({
    orgSlug: ctx?.orgSlug ?? '',
    projectSlug: ctx?.projectSlug ?? '',
    cloudRunId: ctx !== null ? cloudRunId : null,
  });
  return ctx !== null && cloudRunId !== null ? cloud : local;
}
