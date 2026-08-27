import { describe, expect, it } from 'vitest';
import {
  mapAgyQuotaSummary,
  mapClaudeUsage,
  mapCodexUsage,
  mapCopilotUsage,
  parseAntigravitySecret,
} from '../../src/handlers/cost.js';

describe('cost:usage mappers', () => {
  it('maps and clamps Claude utilization windows', () => {
    expect(mapClaudeUsage({
      five_hour: { utilization: 25, resets_at: '2026-08-27T12:00:00Z' },
      seven_day: { utilization: 125 },
    })).toEqual([
      { id: '5h', label: '5h', pct: 0.25, resetsAt: '2026-08-27T12:00:00Z' },
      { id: '7d', label: '7d', pct: 1, resetsAt: null },
    ]);
  });

  it('maps Codex consumed percentages and UNIX reset times', () => {
    const mapped = mapCodexUsage({
      plan_type: 'plus',
      rate_limit: {
        primary_window: {
          used_percent: 12.5,
          limit_window_seconds: 18_000,
          reset_at: 1_700_000_000,
        },
        secondary_window: {
          used_percent: 150,
          limit_window_seconds: 7_200,
          reset_at: 1_700_000_001,
        },
      },
    });
    expect(mapped.plan).toBe('plus');
    expect(mapped.windows).toEqual([
      {
        id: '5h',
        label: '5h',
        pct: 0.125,
        resetsAt: '2023-11-14T22:13:20.000Z',
      },
      {
        id: 'codex:7200',
        label: '2h',
        pct: 1,
        resetsAt: '2023-11-14T22:13:21.000Z',
      },
    ]);
  });

  it('inverts Antigravity remaining fractions and skips disabled buckets', () => {
    expect(mapAgyQuotaSummary({
      groups: [{
        displayName: 'Gemini',
        buckets: [
          { bucketType: 'weekly', period: 'weekly', remainingFraction: 0.75 },
          { bucketType: 'session', period: 'session', remainingFraction: 0.5, disabled: true },
        ],
      }],
    })).toEqual([{
      id: 'Gemini:weekly',
      label: 'weekly',
      pct: 0.25,
      resetsAt: null,
      detail: 'Gemini',
    }]);
  });

  it('parses Antigravity token strings and token objects', () => {
    const token = { access_token: 'access', refresh_token: 'refresh' };
    expect(parseAntigravitySecret({ auth_method: 'oauth', token: JSON.stringify(token) }))
      .toEqual({ access_token: 'access', refresh_token: 'refresh' });
    expect(parseAntigravitySecret({ auth_method: 'oauth', token }))
      .toEqual({ access_token: 'access', refresh_token: 'refresh' });
  });

  it('inverts Copilot remaining quota and omits unlimited premium quota', () => {
    expect(mapCopilotUsage({
      copilot_plan: 'individual',
      quota_reset_date: '2026-09-01',
      quota_snapshots: {
        premium_interactions: { entitlement: 1500, remaining: 1498, percent_remaining: 99.9 },
      },
    })).toEqual({
      plan: 'individual',
      windows: [{
        id: 'monthly',
        label: 'monthly',
        pct: 0.0009999999999998899,
        resetsAt: '2026-09-01T00:00:00.000Z',
        detail: '1498 / 1500',
      }],
    });
    expect(mapCopilotUsage({
      copilot_plan: 'individual',
      quota_snapshots: { premium_interactions: { unlimited: true } },
    })).toEqual({ plan: 'individual', windows: [] });
  });
});
