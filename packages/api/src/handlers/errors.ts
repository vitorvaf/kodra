import type { z } from 'zod';
import { DuplicateIssueNumberError, InvalidIssueIdError } from '@kanbots/local-store';

export type NamedError = Error & { name: string };

export function namedError(
  name: string,
  message: string,
  extra: Record<string, unknown> = {},
): NamedError {
  const err = new Error(message) as NamedError;
  err.name = name;
  for (const [k, v] of Object.entries(extra)) {
    (err as unknown as Record<string, unknown>)[k] = v;
  }
  return err;
}

export function notFound(message = 'not found'): NamedError {
  return namedError('NotFound', message);
}

export function badRequest(message: string): NamedError {
  return namedError('BadRequest', message, { status: 400 });
}

export function conflict(message: string): NamedError {
  return namedError('Conflict', message, { status: 409 });
}

/** Translate repository-specific create errors into transport-neutral API errors. */
export function mapIssueError(err: unknown): NamedError | null {
  if (err instanceof InvalidIssueIdError) {
    return badRequest(`Invalid issue id '${err.issueId}'`);
  }
  if (err instanceof DuplicateIssueNumberError) {
    return conflict(`Issue number '${err.issueNumber}' already exists`);
  }
  return null;
}

export function alreadyActive(
  message: string,
  run: unknown,
): NamedError {
  return namedError('AlreadyActive', message, { run });
}

export function parseArgs<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw namedError('ValidationError', 'validation failed', {
    issues: result.error.issues,
  });
}
