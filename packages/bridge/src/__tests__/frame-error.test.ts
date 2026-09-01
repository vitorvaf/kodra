import { describe, expect, it } from 'vitest';
import { reportFrameError } from '../frame-error.js';

describe('reportFrameError', () => {
  it('passes a short, control-char-free raw line through unchanged', () => {
    const result = reportFrameError({
      lineNumber: 7,
      raw: 'invalid frame body',
      reason: 'unexpected token',
    });
    expect(result).toEqual({
      lineNumber: 7,
      reason: 'unexpected token',
      rawPreview: 'invalid frame body',
      truncated: false,
    });
  });

  it('preserves a raw of exactly 200 chars without flagging truncation', () => {
    const exact = 'b'.repeat(200);
    const result = reportFrameError({
      lineNumber: 2,
      raw: exact,
      reason: 'boundary',
    });
    expect(result.rawPreview).toBe(exact);
    expect(result.rawPreview.length).toBe(200);
    expect(result.truncated).toBe(false);
  });

  it('truncates raw to the first 200 chars and sets the truncation marker', () => {
    const long = 'a'.repeat(500);
    const result = reportFrameError({
      lineNumber: 1,
      raw: long,
      reason: 'too long',
    });
    expect(result.rawPreview).toBe('a'.repeat(200));
    expect(result.rawPreview.length).toBe(200);
    expect(result.truncated).toBe(true);
  });

  it('redacts ASCII control chars (0x00-0x1F and 0x7F) to "?" in the preview', () => {
    const raw = 'safe\x00\x01\x09\x1f\x7fend';
    const result = reportFrameError({
      lineNumber: 3,
      raw,
      reason: 'control chars',
    });
    expect(result.rawPreview).toBe('safe?????end');
    expect(result.truncated).toBe(false);
  });

  it('redacts before truncating so the preview is always sanitized', () => {
    const raw = 'x'.repeat(195) + '\x00' + 'y'.repeat(10);
    const result = reportFrameError({
      lineNumber: 4,
      raw,
      reason: 'mixed control + overflow',
    });
    expect(result.rawPreview).toBe('x'.repeat(195) + '?' + 'y'.repeat(4));
    expect(result.rawPreview.length).toBe(200);
    expect(result.truncated).toBe(true);
    expect(result.rawPreview.includes('\x00')).toBe(false);
  });

  it('forwards lineNumber and reason verbatim', () => {
    const result = reportFrameError({
      lineNumber: 42,
      raw: 'ok',
      reason: 'something specific',
    });
    expect(result.lineNumber).toBe(42);
    expect(result.reason).toBe('something specific');
  });

  it('handles an empty raw without truncation', () => {
    const result = reportFrameError({
      lineNumber: 0,
      raw: '',
      reason: 'empty',
    });
    expect(result.rawPreview).toBe('');
    expect(result.truncated).toBe(false);
  });
});
