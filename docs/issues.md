# Issues

A workspace operates in one of two modes — `local` or `github`. Both
implement the same `IssueSource` contract from `@kanbots/core`, so the UI
and agents don't care which backend they're hitting.

## Local mode

The default for any folder without a configured GitHub remote (or when
you opt in explicitly).

- Issues are rows in the `local_issues` table inside `.kanbots/db.sqlite`.
- Comments are rows in `messages` linked to the issue id.
- The schema mirrors GitHub's: number, title, body, labels, state
  (`open` / `closed`), `createdAt`, `updatedAt`, assignees.
- Issue numbers are monotonic per workspace, starting at 1.

There's no remote, no sync, no auth. Backups = copy `.kanbots/db.sqlite`.

`config.json` for a local workspace:

```json
{
  "mode": "local",
  "name": "my-side-project",
  "authorLogin": "leo"
}
```

`authorLogin` is what gets written as the issue/comment author and is
used in mentions. It defaults to `git config user.name` on first open.

## GitHub mode

Issues live on github.com; kanbots is a UI over the REST API plus a
local cache for performance.

- Reads/writes go through `@octokit/core` with the
  `paginateRest` plugin and ETag caching for GETs.
- The kanban "status" is encoded as a `status:*` label
  (`status:backlog`, `status:todo`, `status:in-progress`, `status:review`,
  `status:done`). Drag-and-drop edits the labels via the `PATCH
  /repos/{owner}/{repo}/issues/{n}` endpoint.
- The agent state is encoded as an `agent:*` label (`agent:running`,
  `agent:blocked`, `agent:review`, `agent:failed`).
- These labels are auto-created on first sync if they don't exist.

`config.json` for a GitHub workspace:

```json
{
  "mode": "github",
  "owner": "leodavinci1",
  "repo": "kanbots"
}
```

### GitHub authentication

`@kanbots/core`'s `resolveGitHubToken()` tries, in order:

1. **`gh auth token`** — runs the GitHub CLI. The simplest option:
   `gh auth login` once and forget about it.
2. **`GITHUB_TOKEN`** environment variable.
3. **`~/.kanbots/token`** — a file containing only the token.

Personal access tokens need at least `repo` scope. For private repos,
fine-grained tokens with `Contents: read/write`, `Issues: read/write`,
and `Pull requests: read/write` are enough.

If all three fail, kanbots stays in read-only display until you fix it —
no silent failures on writes.

## The `IssueSource` contract

Both backends implement:

```ts
interface IssueSource {
  listIssues(opts?: { state?: 'open' | 'closed' | 'all' }): Promise<Issue[]>;
  getIssue(number: number): Promise<Issue>;
  listComments(number: number): Promise<Comment[]>;
  addComment(number: number, body: string): Promise<Comment>;
  createIssue(input: CreateIssueInput): Promise<Issue>;
  updateIssue(number: number, patch: UpdateIssuePatch): Promise<Issue>;
  openDraftPR?(input: OpenPRInput): Promise<PullRequest>;  // optional
}
```

`openDraftPR` is implemented only by the GitHub source — local mode has
no concept of pull requests, so the **Open draft PR** action is hidden
on local cards.

## Switching modes

You can change a workspace's mode after the fact, but the backing data
doesn't move. Switching `local` → `github` means the GitHub repo's
issues become the source of truth; the rows in `local_issues` are
ignored. There's no migration tool yet — if you need it, dump the local
issues, post them to GitHub manually, then switch.

## Sentry import

If you've configured Sentry (see [Sentry](#sentry-integration)), the
poller pulls new error groups and creates kanbots issues for them. Each
imported issue:

- Lands in the **Inbox** (no `status:*` label) until you triage it.
- Carries a `sentry:` prefixed link in its body and links to the
  original Sentry issue ID via the `sentry_imports` table.
- Is de-duplicated — same Sentry issue id won't be re-imported.

You can have a Claude run analyse Sentry issues to suggest a category
(`bug`, `noise`, `expected`) and confidence. Suggestions appear in
the Inbox column with a verdict button.

## Sentry integration

Configure once per workspace in **Settings → Sentry**:

- **Org slug** — `https://yourorg.sentry.io` → `yourorg`.
- **Project slug** — the project's slug as it appears in URLs.
- **Auth token** — a Sentry user auth token with `event:read` and
  `project:read`.
- **Environment filter** (optional) — only import issues from this env
  (e.g. `production`).
- **Poll interval** — default 5 minutes.

The token is encrypted with Electron `safeStorage` if available; on
Linux without a working keyring this falls back to plaintext storage in
the SQLite row, so be aware on shared machines.

Sync runs automatically on the configured interval and on demand via
**Sync now**.

## Search and filters

The board's left rail has a free-text search over issue titles and
bodies and quick filters by `agent:*` state. Search is a simple
`LIKE %q%` over the SQLite rows in local mode and a client-side filter
over the synced cache in GitHub mode — there's no FTS index.

## Files of interest

- `packages/core/src/issue-source.ts` — the contract
- `packages/core/src/github-client.ts` — Octokit implementation
- `packages/core/src/auth.ts` — token resolution
- `packages/local-store/src/local-issue-source.ts` — SQLite implementation
- `packages/local-store/src/repos/sentry-imports.ts` — Sentry sync state
- `packages/api/src/handlers/sentry.ts` — Sentry IPC handlers
