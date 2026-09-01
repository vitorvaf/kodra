import { SentryAuthError, SentryClient } from '@kanbots/core';
import type { SentryEventDetail, SentryStackFrame } from '@kanbots/core';
import { z } from 'zod';
import type {
  DecoratedIssue,
  SentryAnalyzerInput,
  SentryConfigInput,
  SentryConfigPayload,
  SentrySyncResult,
  SentryTestConnectionResult,
} from '../bridge.js';
import type { SentrySuggestion } from '@kanbots/local-store';
import { badRequest, parseArgs } from './errors.js';
import { decorateIssue, lookupSentryMeta } from './issues.js';
import type { HandlerDeps } from './types.js';

const STATUS_PREFIX = 'status:';
const STATUS_BACKLOG = 'status:backlog';
const STACK_FRAME_LIMIT = 25;
const BREADCRUMB_LIMIT = 12;

const saveConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    orgSlug: z.string().min(1).max(120).nullable().optional(),
    projectSlug: z.string().min(1).max(120).nullable().optional(),
    token: z.string().min(1).max(2_000).nullable().optional(),
    pollIntervalSeconds: z.number().int().min(60).max(3_600).optional(),
    environmentFilter: z.string().max(120).nullable().optional(),
  })
  .strict();

const testConnectionSchema = z
  .object({
    token: z.string().min(1).max(2_000).optional(),
    orgSlug: z.string().min(1).max(120).optional(),
    projectSlug: z.string().min(1).max(120).optional(),
  })
  .strict();

const issueRefSchema = z
  .object({
    issueNumber: z.number().int().positive(),
  })
  .strict();

export async function getConfig(deps: HandlerDeps): Promise<SentryConfigPayload> {
  return readConfigPayload(deps);
}

export async function saveConfig(
  deps: HandlerDeps,
  args: SentryConfigInput,
): Promise<SentryConfigPayload> {
  const parsed = parseArgs(saveConfigSchema, args);
  const patch: Parameters<typeof deps.store.sentryConfig.update>[0] = {};

  if (parsed.enabled !== undefined) patch.enabled = parsed.enabled;
  if (parsed.orgSlug !== undefined) patch.orgSlug = normalizeSlug(parsed.orgSlug);
  if (parsed.projectSlug !== undefined) patch.projectSlug = normalizeSlug(parsed.projectSlug);
  if (parsed.pollIntervalSeconds !== undefined) {
    patch.pollIntervalSeconds = parsed.pollIntervalSeconds;
  }
  if (parsed.environmentFilter !== undefined) {
    patch.environmentFilter = normalizeSlug(parsed.environmentFilter);
  }

  if (parsed.token !== undefined) {
    if (parsed.token === null || parsed.token === '') {
      patch.tokenEncrypted = null;
      patch.tokenEncryption = 'plain';
    } else {
      const { buffer, encryption } = deps.sentry.encryptToken(parsed.token);
      patch.tokenEncrypted = buffer;
      patch.tokenEncryption = encryption;
      // Reset error state on credential change.
      patch.lastError = null;
      patch.consecutiveAuthFailures = 0;
    }
  }

  deps.store.sentryConfig.update(patch);
  deps.sentry.restartPoller();
  return readConfigPayload(deps);
}

export async function testConnection(
  deps: HandlerDeps,
  args: { token?: string; orgSlug?: string; projectSlug?: string },
): Promise<SentryTestConnectionResult> {
  const parsed = parseArgs(testConnectionSchema, args ?? {});
  const config = deps.store.sentryConfig.get();

  const orgSlug = parsed.orgSlug ?? config.orgSlug;
  const projectSlug = parsed.projectSlug ?? config.projectSlug;
  const token =
    parsed.token ??
    deps.sentry.envTokenOverride() ??
    deps.sentry.decryptToken(config.tokenEncrypted, config.tokenEncryption);

  if (!orgSlug || !projectSlug) {
    throw badRequest('orgSlug and projectSlug are required');
  }
  if (!token) {
    throw badRequest('Sentry token is required');
  }

  const client = new SentryClient({ token, orgSlug, projectSlug });
  const result = await client.testConnection();
  return result;
}

export async function syncNow(deps: HandlerDeps): Promise<SentrySyncResult> {
  return deps.sentry.syncNow();
}

export async function analyze(
  deps: HandlerDeps,
  args: { issueNumber: number },
): Promise<SentrySuggestion> {
  const parsed = parseArgs(issueRefSchema, args);
  const importRow = deps.store.sentryImports.findByLocalNumber(parsed.issueNumber);
  if (!importRow) {
    throw badRequest(`Issue #${parsed.issueNumber} is not from Sentry`);
  }

  const config = deps.store.sentryConfig.get();
  const token =
    deps.sentry.envTokenOverride() ??
    deps.sentry.decryptToken(config.tokenEncrypted, config.tokenEncryption);
  if (!token || !config.orgSlug || !config.projectSlug) {
    throw badRequest('Sentry is not configured');
  }

  const client = new SentryClient({
    token,
    orgSlug: config.orgSlug,
    projectSlug: config.projectSlug,
  });
  const detail = await client.getIssueDetail(importRow.sentryIssueId);
  const input = buildAnalyzerInput(importRow, detail.latestEvent, config.environmentFilter);
  const suggestion = await deps.analyzeSentryError(input);
  deps.store.sentryImports.setSuggestion(parsed.issueNumber, suggestion);
  return suggestion;
}

export async function applySuggestion(
  deps: HandlerDeps,
  args: { issueNumber: number },
): Promise<DecoratedIssue> {
  const parsed = parseArgs(issueRefSchema, args);
  const importRow = deps.store.sentryImports.findByLocalNumber(parsed.issueNumber);
  if (!importRow) {
    throw badRequest(`Issue #${parsed.issueNumber} is not from Sentry`);
  }
  if (!importRow.suggestion) {
    throw badRequest('Sentry issue has not been analyzed yet');
  }

  const issue = await deps.source.getIssue(parsed.issueNumber);
  const newLabels = withStatusBacklog(issue.labels);
  const updated = await deps.source.updateIssue(parsed.issueNumber, {
    title: importRow.suggestion.suggestedTitle,
    body: importRow.suggestion.suggestedBody,
    labels: newLabels,
  });
  deps.store.sentryImports.markApplied(parsed.issueNumber);
  return decorateIssue(updated, null, lookupSentryMeta(deps, parsed.issueNumber));
}

function readConfigPayload(deps: HandlerDeps): SentryConfigPayload {
  const config = deps.store.sentryConfig.get();
  return {
    enabled: config.enabled,
    orgSlug: config.orgSlug,
    projectSlug: config.projectSlug,
    hasToken:
      deps.sentry.envTokenOverride() !== null ||
      (config.tokenEncrypted !== null && config.tokenEncrypted.length > 0),
    tokenEncryption: config.tokenEncryption,
    safeStorageAvailable: deps.sentry.safeStorageAvailable(),
    pollIntervalSeconds: config.pollIntervalSeconds,
    environmentFilter: config.environmentFilter,
    lastSyncedAt: config.lastSyncedAt,
    lastError: config.lastError,
    consecutiveAuthFailures: config.consecutiveAuthFailures,
  };
}

function normalizeSlug(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function withStatusBacklog(labels: string[]): string[] {
  const filtered = labels.filter((l) => !l.startsWith(STATUS_PREFIX));
  filtered.push(STATUS_BACKLOG);
  return filtered;
}

function buildAnalyzerInput(
  importRow: NonNullable<ReturnType<HandlerDeps['store']['sentryImports']['findByLocalNumber']>>,
  event: SentryEventDetail | null,
  environmentFilter: string | null,
): SentryAnalyzerInput {
  const frames: SentryAnalyzerInput['stackFrames'] = [];
  if (event) {
    for (const exc of event.exception) {
      if (!exc.stacktrace) continue;
      for (const frame of exc.stacktrace.frames.slice(-STACK_FRAME_LIMIT)) {
        frames.push(frameToInput(frame));
      }
    }
  }

  const breadcrumbs: SentryAnalyzerInput['breadcrumbs'] = (event?.breadcrumbs ?? [])
    .slice(-BREADCRUMB_LIMIT)
    .map((b) => ({
      timestamp: b.timestamp,
      category: b.category,
      level: b.level,
      message: b.message,
    }));

  return {
    errorType: importRow.errorType,
    errorValue: importRow.errorValue,
    culprit: importRow.culprit,
    permalink: importRow.permalink,
    environment: event?.environment ?? environmentFilter ?? null,
    count: importRow.count,
    firstSeen: importRow.firstSeenAt,
    lastSeen: importRow.lastSeenAt,
    stackFrames: frames,
    breadcrumbs,
  };
}

function frameToInput(frame: SentryStackFrame): SentryAnalyzerInput['stackFrames'][number] {
  return {
    filename: frame.filename,
    function: frame.function,
    lineno: frame.lineno,
    inApp: frame.inApp,
    contextLine: frame.contextLine,
  };
}

// Re-export so consumers know what auth errors look like during sync
export { SentryAuthError };
