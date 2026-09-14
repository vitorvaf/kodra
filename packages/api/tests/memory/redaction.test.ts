import { describe, expect, it } from 'vitest';
import { containsCredentials, findCredentials } from '../../src/memory/redaction.js';

describe('findCredentials', () => {
  it('accepts ordinary engineering notes', () => {
    const notes = [
      'The supplier can send a duplicated ACK; consumers must be idempotent.',
      'ADR-0014 chose polling every 30 seconds over WebSocket.',
      'token bucket rate limiter lives in src/limits.ts',
      'password reset flow sends an email with a 15 minute link',
    ];
    for (const note of notes) {
      expect(findCredentials(note)).toEqual([]);
    }
  });

  it('flags well-known credential shapes without echoing the value', () => {
    const samples: Array<[string, string]> = [
      ['aws-access-key', 'key AKIAIOSFODNN7EXAMPLE was used'],
      ['github-token', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
      ['openai-or-anthropic-key', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz'],
      ['google-oauth-secret', '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'],
      ['private-key-block', '-----BEGIN RSA PRIVATE KEY-----\nMIIE...'],
      ['bearer-token', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345'],
      ['credential-assignment', 'AGENTMEMORY_SECRET=0123456789abcdef'],
      ['url-with-password', 'postgres://app:hunter2secret@db.internal/app'],
      [
        'jwt',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      ],
    ];
    for (const [label, text] of samples) {
      const found = findCredentials(text);
      expect(found, text).toContain(label);
      expect(found.join(' ')).not.toContain('hunter2');
    }
    expect(containsCredentials('nothing here')).toBe(false);
  });
});
