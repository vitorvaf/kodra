export type FrameError = {
  lineNumber: number;
  reason: string;
  rawPreview: string;
  truncated: boolean;
};

export type ReportFrameErrorInput = {
  lineNumber: number;
  raw: string;
  reason: string;
};

const PREVIEW_LIMIT = 200;
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/g;
const REDACTION_CHAR = '?';

export function reportFrameError(input: ReportFrameErrorInput): FrameError {
  const sanitized = input.raw.replace(CONTROL_CHAR_PATTERN, REDACTION_CHAR);
  const truncated = sanitized.length > PREVIEW_LIMIT;
  const rawPreview = truncated ? sanitized.slice(0, PREVIEW_LIMIT) : sanitized;
  return {
    lineNumber: input.lineNumber,
    reason: input.reason,
    rawPreview,
    truncated,
  };
}
