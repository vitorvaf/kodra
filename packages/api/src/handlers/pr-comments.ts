import type { PullRequest } from '@kanbots/core';
import { z } from 'zod';
import type { PrCommentPayload, PrCommentsListResult } from '../bridge.js';
import { badRequest, notFound, parseArgs } from './errors.js';
import type { HandlerDeps } from './types.js';

const listSchema = z
  .object({ issueNumber: z.number().int().positive() })
  .strict();

const replySchema = z
  .object({
    issueNumber: z.number().int().positive(),
    body: z.string().min(1).max(65_536),
  })
  .strict();

interface ResolvedPull {
  number: number;
  htmlUrl: string;
  /** True when the issue itself is the PR (so the conversation comments
   *  are already surfaced by the existing issue-detail payload and we
   *  should NOT duplicate them here). */
  issueIsPr: boolean;
}

/**
 * Resolve the PR linked to a given issue.
 *
 * Strategy, in order:
 *   1. If the issue IS a PR (`isPullRequest === true`), use it directly.
 *      No lookup needed.
 *   2. Otherwise walk the issue's thread agent runs newest-first and look
 *      up each branch via the GitHub `pulls?head=owner:branch` filter.
 *      Returns the first match. We don't write to the local `promotions`
 *      table on PR open (the existing `promotePr` doesn't, either) — so
 *      relying on the branch is the most robust signal available.
 *
 * Returns `null` if neither the issue nor any of its run branches map
 * to a PR.
 */
async function resolveLinkedPull(
  deps: HandlerDeps,
  issueNumber: number,
): Promise<ResolvedPull | null> {
  const issue = await deps.source.getIssue(issueNumber);
  if (issue.isPullRequest) {
    return {
      number: issue.number,
      htmlUrl: issue.htmlUrl,
      issueIsPr: true,
    };
  }
  const findOpenPull = deps.source.findOpenPullForBranch;
  if (typeof findOpenPull !== 'function') return null;
  const thread = deps.store.threads.findByIssue(
    deps.config.owner,
    deps.config.repo,
    issueNumber,
  );
  if (!thread) return null;
  const runs = deps.store.agentRuns.listByThread(thread.id);
  // listByThread is ASC by id; walk newest-first so we prefer the most
  // recent run's branch when a thread has been re-dispatched into a new
  // branch (older promote-to-PR runs become stale).
  const seen = new Set<string>();
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const branch = runs[i]?.branchName ?? null;
    if (branch === null || seen.has(branch)) continue;
    seen.add(branch);
    let pr: PullRequest | null;
    try {
      pr = await findOpenPull.call(deps.source, branch);
    } catch {
      // Best-effort: a transient network error on one branch shouldn't
      // block us from trying the next one. The list endpoint will
      // surface the underlying failure if every branch fails.
      pr = null;
    }
    if (pr) {
      return { number: pr.number, htmlUrl: pr.htmlUrl, issueIsPr: false };
    }
  }
  return null;
}

export async function list(
  deps: HandlerDeps,
  args: { issueNumber: number },
): Promise<PrCommentsListResult> {
  const parsed = parseArgs(listSchema, args);
  if (deps.config.mode !== 'github') {
    return { linkedPullNumber: null, linkedPullHtmlUrl: null, comments: [] };
  }

  const linked = await resolveLinkedPull(deps, parsed.issueNumber);
  if (!linked) {
    return { linkedPullNumber: null, linkedPullHtmlUrl: null, comments: [] };
  }

  const listReview = deps.source.listPullReviewComments;
  const out: PrCommentPayload[] = [];

  // Conversation-tab comments: only fetch when the issue is NOT itself
  // the PR — otherwise the existing IssueDetail.comments payload already
  // carries them and we'd render duplicates.
  if (!linked.issueIsPr) {
    const conversation = await deps.source.listComments(linked.number);
    for (const c of conversation) {
      out.push({
        id: c.id,
        author: c.user,
        body: c.body,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        htmlUrl: c.htmlUrl,
        inline: false,
      });
    }
  }

  // Review (inline diff) comments. Optional on the source — when absent
  // we just skip without erroring so non-github sources stay functional.
  if (typeof listReview === 'function') {
    const review = await listReview.call(deps.source, linked.number);
    for (const r of review) {
      out.push({
        id: r.id,
        author: r.user,
        body: r.body,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        htmlUrl: r.htmlUrl,
        inline: true,
        filePath: r.path,
        ...(r.line !== null ? { lineNumber: r.line } : {}),
      });
    }
  }

  // Stable sort: oldest-first matches GitHub's thread display + the
  // local thread tab's chronological ordering.
  out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id - b.id));

  return {
    linkedPullNumber: linked.number,
    linkedPullHtmlUrl: linked.htmlUrl,
    comments: out,
  };
}

export async function reply(
  deps: HandlerDeps,
  args: { issueNumber: number; body: string },
): Promise<PrCommentPayload> {
  const parsed = parseArgs(replySchema, args);
  if (deps.config.mode !== 'github') {
    throw badRequest('PR replies require github mode');
  }
  const body = parsed.body.trim();
  if (body.length === 0) throw badRequest('reply body is empty');

  const linked = await resolveLinkedPull(deps, parsed.issueNumber);
  if (!linked) {
    throw notFound(`no PR is linked to issue ${parsed.issueNumber}`);
  }

  // PRs are issues, so the conversation-tab reply goes through the same
  // POST as `issues:add-comment`. We deliberately do NOT post review
  // (inline) comments here — v1 keeps replies at the top level.
  const created = await deps.source.addComment(linked.number, body);
  return {
    id: created.id,
    author: created.user,
    body: created.body,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    htmlUrl: created.htmlUrl,
    inline: false,
  };
}
