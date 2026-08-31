import {
  isValidCustomIssueId,
  type Comment,
  type Issue,
  type IssueRef,
  type IssueState,
} from '@kanbots/core';
import type { Db } from '../db.js';

interface IssueRow {
  number: string;
  title: string;
  body: string;
  state: string;
  labels: string;
  assignees: string;
  author_login: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface CommentRow {
  id: number;
  issue_number: string;
  body: string;
  author_login: string;
  created_at: string;
  updated_at: string;
}

function rowToIssue(row: IssueRow): Issue {
  return {
    number: /^\d+$/.test(row.number) ? Number(row.number) : row.number,
    title: row.title,
    body: row.body,
    state: row.state as IssueState,
    labels: parseStringArray(row.labels),
    assignees: parseStringArray(row.assignees),
    user: { login: row.author_login, avatarUrl: null },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    htmlUrl: '',
    isPullRequest: false,
  };
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    body: row.body,
    user: { login: row.author_login, avatarUrl: null },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    htmlUrl: '',
  };
}

function parseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export interface CreateLocalIssueInput {
  number?: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  authorLogin: string;
  folderId?: string;
}

export interface UpdateLocalIssuePatch {
  title?: string;
  body?: string;
  state?: IssueState;
  labels?: string[];
  assignees?: string[];
}

export interface CreateLocalCommentInput {
  issueNumber: IssueRef;
  body: string;
  authorLogin: string;
}

export class LocalIssueNotFoundError extends Error {
  readonly status = 404;
  constructor(public readonly issueNumber: IssueRef) {
    super(`Local issue #${issueNumber} not found`);
    this.name = 'LocalIssueNotFoundError';
  }
}

export class InvalidIssueIdError extends Error {
  constructor(public readonly issueId: string) {
    super(`Invalid issue id: ${issueId}`);
    this.name = 'InvalidIssueIdError';
  }
}

export class DuplicateIssueNumberError extends Error {
  constructor(public readonly issueNumber: string) {
    super(`Issue number ${issueNumber} already exists`);
    this.name = 'DuplicateIssueNumberError';
  }
}

export const bindIssueRef = (ref: IssueRef): string => String(ref);

export class LocalIssuesRepo {
  // local_issues.number is TEXT: always bind String(ref)
  constructor(private readonly db: Db) {}

  list(opts: { state?: 'open' | 'closed' | 'all'; folderId?: string } = {}): Issue[] {
    const state = opts.state ?? 'open';
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (state !== 'all') {
      conditions.push('state = ?');
      params.push(state);
    }
    if (opts.folderId !== undefined) {
      conditions.push('folder_id = ?');
      params.push(opts.folderId);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM local_issues${where}`).all(...params) as IssueRow[];
    return rows.map(rowToIssue).sort((a, b) => {
      if (typeof a.number === 'number' && typeof b.number === 'number') return b.number - a.number;
      if (typeof a.number === 'number') return -1;
      if (typeof b.number === 'number') return 1;
      return a.number === b.number ? 0 : a.number > b.number ? -1 : 1;
    });
  }

  findByNumber(number: IssueRef): Issue | null {
    const row = this.db
      .prepare('SELECT * FROM local_issues WHERE number = ?')
      .get(bindIssueRef(number)) as
      | IssueRow
      | undefined;
    return row ? rowToIssue(row) : null;
  }

  create(input: CreateLocalIssueInput): Issue {
    const now = new Date().toISOString();
    const tx = this.db.transaction((args: CreateLocalIssueInput): Issue => {
      const rows = this.db.prepare('SELECT number FROM local_issues').all() as Array<{ number: string }>;
      const numericNumbers = rows
        .map((row) => row.number)
        .filter((number) => /^\d+$/.test(number))
        .map(Number);
      const nextNumber = (numericNumbers.length > 0 ? Math.max(...numericNumbers) : 0) + 1;
      const issueNumber = args.number ?? String(nextNumber);
      if (args.number !== undefined) {
        if (!isValidCustomIssueId(args.number)) throw new InvalidIssueIdError(args.number);
        if (/^\d+$/.test(args.number)) {
          const n = Number(args.number);
          if (!Number.isSafeInteger(n) || String(n) !== args.number) {
            throw new InvalidIssueIdError(args.number);
          }
        }
        const duplicate = this.db
          .prepare('SELECT 1 FROM local_issues WHERE number = ? COLLATE NOCASE LIMIT 1')
          .get(bindIssueRef(args.number));
        if (duplicate) throw new DuplicateIssueNumberError(args.number);
      }
      if (args.folderId === undefined) {
        this.db
          .prepare(
            `INSERT INTO local_issues
              (number, title, body, state, labels, assignees, author_login, created_at, updated_at)
             VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
          )
          .run(
            bindIssueRef(issueNumber),
            args.title,
            args.body ?? '',
            JSON.stringify(args.labels ?? []),
            JSON.stringify(args.assignees ?? []),
            args.authorLogin,
            now,
            now,
          );
      } else {
        this.db
          .prepare(
            `INSERT INTO local_issues
              (number, title, body, state, labels, assignees, author_login, created_at, updated_at, folder_id)
             VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            bindIssueRef(issueNumber),
            args.title,
            args.body ?? '',
            JSON.stringify(args.labels ?? []),
            JSON.stringify(args.assignees ?? []),
            args.authorLogin,
            now,
            now,
            args.folderId,
          );
      }
      const issue = this.findByNumber(issueNumber);
      if (!issue) throw new Error(`Failed to insert local issue ${issueNumber}`);
      return issue;
    });
    return tx.immediate(input);
  }

  update(number: IssueRef, patch: UpdateLocalIssuePatch): Issue {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (patch.title !== undefined) {
      fields.push('title = ?');
      values.push(patch.title);
    }
    if (patch.body !== undefined) {
      fields.push('body = ?');
      values.push(patch.body);
    }
    if (patch.state !== undefined) {
      fields.push('state = ?');
      values.push(patch.state);
      fields.push('closed_at = ?');
      values.push(patch.state === 'closed' ? new Date().toISOString() : null);
    }
    if (patch.labels !== undefined) {
      fields.push('labels = ?');
      values.push(JSON.stringify(patch.labels));
    }
    if (patch.assignees !== undefined) {
      fields.push('assignees = ?');
      values.push(JSON.stringify(patch.assignees));
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(bindIssueRef(number));

    const result = this.db
      .prepare(`UPDATE local_issues SET ${fields.join(', ')} WHERE number = ?`)
      .run(...values);

    if (result.changes === 0) {
      throw new LocalIssueNotFoundError(number);
    }
    const updated = this.findByNumber(number);
    if (!updated) throw new LocalIssueNotFoundError(number);
    return updated;
  }

  listComments(issueNumber: IssueRef): Comment[] {
    const rows = this.db
      .prepare('SELECT * FROM local_comments WHERE issue_number = ? ORDER BY id')
      .all(bindIssueRef(issueNumber)) as CommentRow[];
    return rows.map(rowToComment);
  }

  addComment(input: CreateLocalCommentInput): Comment {
    const issue = this.findByNumber(input.issueNumber);
    if (!issue) throw new LocalIssueNotFoundError(input.issueNumber);
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO local_comments (issue_number, body, author_login, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(bindIssueRef(input.issueNumber), input.body, input.authorLogin, now, now);

    this.db
      .prepare('UPDATE local_issues SET updated_at = ? WHERE number = ?')
      .run(now, bindIssueRef(input.issueNumber));

    return {
      id: Number(result.lastInsertRowid),
      body: input.body,
      user: { login: input.authorLogin, avatarUrl: null },
      createdAt: now,
      updatedAt: now,
      htmlUrl: '',
    };
  }
}
