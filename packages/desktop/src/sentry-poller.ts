import { SentryAuthError, SentryClient, type IssueSource } from '@kanbots/core';
import type { SentryIssueSummary } from '@kanbots/core';
import type { SentryConfig, Store } from '@kanbots/local-store';
import { resolveSentryToken } from './sentry-token.js';

const AUTH_FAILURE_THRESHOLD = 3;
const FIRST_SYNC_STATS_PERIOD = '14d';
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;

export interface SentryPollerOptions {
  store: Store;
  source: IssueSource;
  broadcast: () => void;
}

export interface SentrySyncSummary {
  imported: number;
  updated: number;
  totalSeen: number;
  lastSyncedAt: string;
}

export class SentryPoller {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<SentrySyncSummary> | null = null;

  constructor(private readonly opts: SentryPollerOptions) {}

  start(): void {
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  restart(): void {
    this.stop();
    this.scheduleNext();
  }

  async runOnce(): Promise<SentrySyncSummary> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.syncOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private scheduleNext(): void {
    const config = this.opts.store.sentryConfig.get();
    if (!config.enabled) return;
    const intervalMs = Math.max(60, Math.min(3_600, config.pollIntervalSeconds)) * 1_000;
    this.timer = setTimeout(() => {
      void this.tick();
    }, intervalMs);
  }

  private async tick(): Promise<void> {
    try {
      await this.runOnce();
    } catch (err) {
      // Errors are surfaced via lastError on config; log and continue.
      console.error('[sentry-poller] sync failed:', err);
    } finally {
      this.scheduleNext();
    }
  }

  private async syncOnce(): Promise<SentrySyncSummary> {
    const empty: SentrySyncSummary = {
      imported: 0,
      updated: 0,
      totalSeen: 0,
      lastSyncedAt: new Date().toISOString(),
    };

    const config = this.opts.store.sentryConfig.get();
    if (!config.enabled) return empty;

    const token = resolveSentryToken(config.tokenEncrypted, config.tokenEncryption);
    if (!token || !config.orgSlug || !config.projectSlug) {
      this.opts.store.sentryConfig.update({
        lastError: 'Sentry is not fully configured (token, org, or project missing).',
      });
      return empty;
    }

    const client = new SentryClient({
      token,
      orgSlug: config.orgSlug,
      projectSlug: config.projectSlug,
    });

    let imported = 0;
    let updated = 0;
    let totalSeen = 0;
    const seenAt = new Date().toISOString();

    try {
      const all = await this.fetchAllIssues(client, config);
      totalSeen = all.length;
      for (const sentryIssue of all) {
        const existing = this.opts.store.sentryImports.findBySentryId(sentryIssue.id);
        if (existing) {
          this.opts.store.sentryImports.upsert({
            sentryIssueId: sentryIssue.id,
            localIssueNumber: existing.localIssueNumber,
            count: sentryIssue.count,
            firstSeenAt: existing.firstSeenAt,
            lastSeenAt: sentryIssue.lastSeen,
            lastEventId: sentryIssue.lastEventId,
            permalink: sentryIssue.permalink,
            culprit: sentryIssue.culprit,
            errorType: sentryIssue.errorType,
            errorValue: sentryIssue.errorValue,
          });
          updated += 1;
        } else {
          const issue = await this.opts.source.createIssue({
            title: truncate(sentryIssue.title, 200),
            body: formatSentryBody(sentryIssue),
          });
          this.opts.store.sentryImports.upsert({
            sentryIssueId: sentryIssue.id,
            localIssueNumber: issue.number,
            count: sentryIssue.count,
            firstSeenAt: sentryIssue.firstSeen,
            lastSeenAt: sentryIssue.lastSeen,
            lastEventId: sentryIssue.lastEventId,
            permalink: sentryIssue.permalink,
            culprit: sentryIssue.culprit,
            errorType: sentryIssue.errorType,
            errorValue: sentryIssue.errorValue,
          });
          imported += 1;
        }
      }

      const lastSyncedAt = seenAt;
      this.opts.store.sentryConfig.update({
        lastSyncedAt,
        lastError: null,
        consecutiveAuthFailures: 0,
      });
      if (imported > 0 || updated > 0) {
        this.opts.broadcast();
      }
      return { imported, updated, totalSeen, lastSyncedAt };
    } catch (err) {
      if (err instanceof SentryAuthError) {
        const updated = this.opts.store.sentryConfig.recordAuthFailure();
        const next: Parameters<typeof this.opts.store.sentryConfig.update>[0] = {
          lastError: 'Sentry authentication failed — check your token.',
        };
        if (updated.consecutiveAuthFailures >= AUTH_FAILURE_THRESHOLD) {
          next.enabled = false;
        }
        this.opts.store.sentryConfig.update(next);
      } else {
        this.opts.store.sentryConfig.update({
          lastError: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  }

  private async fetchAllIssues(
    client: SentryClient,
    config: SentryConfig,
  ): Promise<SentryIssueSummary[]> {
    const query = 'is:unresolved';
    const statsPeriod = config.lastSyncedAt ? undefined : FIRST_SYNC_STATS_PERIOD;
    const environment = config.environmentFilter ?? null;

    const results: SentryIssueSummary[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const opts: Parameters<SentryClient['listIssues']>[0] = {
        query,
        environment,
        limit: PAGE_LIMIT,
      };
      if (statsPeriod !== undefined) opts.statsPeriod = statsPeriod;
      if (cursor !== undefined) opts.cursor = cursor;
      const result = await client.listIssues(opts);
      for (const issue of result.issues) {
        if (config.lastSyncedAt && issue.lastSeen <= config.lastSyncedAt) continue;
        results.push(issue);
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return results;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function formatSentryBody(issue: SentryIssueSummary): string {
  const lines: string[] = [];
  lines.push(`> Imported from Sentry — [view in Sentry](${issue.permalink})`);
  lines.push('');
  if (issue.errorType || issue.errorValue) {
    lines.push(`**${issue.errorType ?? 'Error'}**: ${issue.errorValue ?? '(no message)'}`);
    lines.push('');
  }
  if (issue.culprit) {
    lines.push(`**Where:** \`${issue.culprit}\``);
  }
  if (issue.level) lines.push(`**Level:** ${issue.level}`);
  lines.push(`**Occurrences:** ${issue.count}`);
  lines.push(`**First seen:** ${issue.firstSeen}`);
  lines.push(`**Last seen:** ${issue.lastSeen}`);
  lines.push('');
  lines.push('_Click **Analyze** to have an agent review this error and propose a task description._');
  return lines.join('\n');
}
