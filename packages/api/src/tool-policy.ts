import type { IssueRef } from '@kanbots/core';
import { issueRefSchema } from './issue-ref.js';

/**
 * Who is calling a kodra MCP tool. The tool bridge resolves the bearer
 * token to one of these, so every tool call carries the identity of the
 * run that made it.
 *
 * - `chat`: the chat agent, which acts on behalf of the user in a
 *   conversation — it keeps the full tool surface.
 * - `card`: an agent working one card. It can read the whole board and
 *   file new cards, but it only writes to its own card and cannot drive
 *   other agents or answer decisions meant for the user.
 */
export type ToolCaller = { kind: 'chat' } | { kind: 'card'; issueNumber: IssueRef };

export class ToolPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolPermissionError';
  }
}

/** Tools any caller may use: they only read board state. */
const READ_TOOLS = new Set([
  'listIssues',
  'getIssue',
  'listAgentRuns',
  'listPendingDecisions',
  'listLearnings',
  'getPerformanceMetrics',
]);

/** Tools a card agent may use, but only against its own card. */
const OWN_CARD_TOOLS = new Set(['updateIssue', 'moveIssueStatus', 'splitIssue']);

/**
 * Throws `ToolPermissionError` when `caller` may not run `name` with
 * `args`. A missing caller means an in-process call, which is trusted.
 */
export function assertToolAllowed(
  name: string,
  args: Record<string, unknown>,
  caller: ToolCaller | undefined,
): void {
  if (caller === undefined || caller.kind === 'chat') return;
  if (READ_TOOLS.has(name)) return;
  if (name === 'createIssue') return;

  if (OWN_CARD_TOOLS.has(name)) {
    const parsed = issueRefSchema.safeParse(args.number);
    if (!parsed.success || !sameIssueRef(parsed.data, caller.issueNumber)) {
      throw new ToolPermissionError(
        `${name}: a card agent can only change its own card (#${caller.issueNumber})`,
      );
    }
    // Splitting is fine; starting agents on the new cards is the user's call.
    if (name === 'splitIssue' && args.dispatch === true) {
      throw new ToolPermissionError(
        'splitIssue: a card agent cannot dispatch agents on the new cards; leave dispatch off',
      );
    }
    return;
  }

  throw new ToolPermissionError(`${name}: not available to card agents`);
}

function sameIssueRef(a: IssueRef, b: IssueRef): boolean {
  return String(a) === String(b);
}
