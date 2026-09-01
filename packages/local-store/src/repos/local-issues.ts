import type { Comment, Issue, IssueState } from '@kanbots/core';
import type { Db } from '../db.js';

interface IssueRow {
  number: number;
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
  issue_number: number;
  body: string;
  author_login: string;
  created_at: string;
  updated_at: string;
}

function rowToIssue(row: IssueRow): Issue {
  return {
    number: row.number,
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
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  authorLogin: string;
}

export interface UpdateLocalIssuePatch {
  title?: string;
  body?: string;
  state?: IssueState;
  labels?: string[];
  assignees?: string[];
}

export interface CreateLocalCommentInput {
  issueNumber: number;
  body: string;
  authorLogin: string;
}

export class LocalIssueNotFoundError extends Error {
  readonly status = 404;
  constructor(public readonly issueNumber: number) {
    super(`Local issue #${issueNumber} not found`);
    this.name = 'LocalIssueNotFoundError';
  }
}

export class LocalIssuesRepo {
  constructor(private readonly db: Db) {}

  list(opts: { state?: 'open' | 'closed' | 'all' } = {}): Issue[] {
    const state = opts.state ?? 'open';
    const rows =
      state === 'all'
        ? (this.db.prepare('SELECT * FROM local_issues ORDER BY number DESC').all() as IssueRow[])
        : (this.db
            .prepare('SELECT * FROM local_issues WHERE state = ? ORDER BY number DESC')
            .all(state) as IssueRow[]);
    return rows.map(rowToIssue);
  }

  findByNumber(number: number): Issue | null {
    const row = this.db.prepare('SELECT * FROM local_issues WHERE number = ?').get(number) as
      | IssueRow
      | undefined;
    return row ? rowToIssue(row) : null;
  }

  create(input: CreateLocalIssueInput): Issue {
    const now = new Date().toISOString();
    const tx = this.db.transaction((args: CreateLocalIssueInput): Issue => {
      const maxRow = this.db
        .prepare('SELECT COALESCE(MAX(number), 0) AS max FROM local_issues')
        .get() as { max: number };
      const nextNumber = maxRow.max + 1;
      this.db
        .prepare(
          `INSERT INTO local_issues
            (number, title, body, state, labels, assignees, author_login, created_at, updated_at)
           VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
        )
        .run(
          nextNumber,
          args.title,
          args.body ?? '',
          JSON.stringify(args.labels ?? []),
          JSON.stringify(args.assignees ?? []),
          args.authorLogin,
          now,
          now,
        );
      const issue = this.findByNumber(nextNumber);
      if (!issue) throw new Error(`Failed to insert local issue ${nextNumber}`);
      return issue;
    });
    return tx(input);
  }

  update(number: number, patch: UpdateLocalIssuePatch): Issue {
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
    values.push(number);

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

  listComments(issueNumber: number): Comment[] {
    const rows = this.db
      .prepare('SELECT * FROM local_comments WHERE issue_number = ? ORDER BY id')
      .all(issueNumber) as CommentRow[];
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
      .run(input.issueNumber, input.body, input.authorLogin, now, now);

    this.db
      .prepare('UPDATE local_issues SET updated_at = ? WHERE number = ?')
      .run(now, input.issueNumber);

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
