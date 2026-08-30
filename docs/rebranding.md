# Kodra rebranding notes

Kodra is the rebranded fork of Kanbots. The fork repository is still named
[`kanbots`](https://github.com/vitorvaf/kanbots), and the upstream project is
maintained at [leodavinci1/kanbots](https://github.com/leodavinci1/kanbots).

## Compatibility identifiers retained

The following names remain unchanged because they are published interfaces,
on-disk data, or runtime integration points:

- npm package and command: `npx kanbots` (the published package is still
  upstream-owned)
- package scope: `@kanbots/*`
- legacy workspace data: `.kanbots/`, including `db.sqlite`, `config.json`,
  and `mcp-runtime/`
- environment variables beginning with `KANBOTS_`; the MCP server also accepts
  preferred `KODRA_TOOL_BRIDGE_URL` and `KODRA_TOOL_BRIDGE_TOKEN` names, with
  the `KANBOTS_TOOL_BRIDGE_*` names retained as fallbacks
- executable: `kanbots-mcp-server` (retained); `kodra-mcp-server` is an added
  alias pointing to the same server
- Electron IPC channels using `kanbots:*`
- the upstream cloud URL: `app.kanbots.dev`
- Electron `userData` directory: packaged builds pin the app name via
  `app.setName('kanbots')` (guarded by `app.isPackaged`) so installers keep
  reading/writing the historical data directory (`app-store.sqlite`,
  `workspaces.json`, `device-chats.db`, `cloud-config.json`) that
  `@kanbots/cli` and `@kanbots/mcp` mirror by path. Dev runs are unaffected
  (they resolve `~/.config/Electron`). Renaming this needs a coordinated
  data migration.
- in-renderer protocol names: `window.kanbots` bridge, `kanbots:*` event
  channels, and localStorage keys like `kanbots:prefs` (prefs versioning
  migrates the old default accent hue to the Kodra accent automatically;
  custom user hues are preserved).

These identifiers are compatibility debt, not new Kodra branding. A future
migration can introduce Kodra-native names without invalidating existing
workspaces, integrations, or package consumers.

## Migrated

- New agent worktrees are created under `.kodra/worktrees/`.
- Historical runs resolve through an existence check and continue using their
  `.kanbots/worktrees/` path when it exists.
- Existing workspaces keep `.kanbots/` as the root for their database and
  configuration; new workspaces use `.kodra/`.
- `.kodra/` is added to the repository's `.gitignore` automatically (alongside
  the legacy `.kanbots/` entry).
- Agent commits are authored as `kodra agent (run #<N>)` with email
  `agent+<N>@kodra.local`; the commit-msg hook stamps `Kodra-Run-Id` /
  `Kodra-Issue` trailers (fresh worktrees only — existing worktrees keep
  their installed `Kanbots-*` hooks, which remain valid metadata).
- The agent decision-fence protocol is `kodra-decision` (emitted in system
  prompts, parsed by the dispatcher stream filter). Renamed everywhere from
  `kanbots-decision` during the pilot; no legacy acceptance is kept.
- New agent branches are named `kodra/issue-<n>-<runId>` (dispatcher
  `defaultBranchName` and the desktop cloud-run dispatcher). The pre-push
  guard still blocks pushes of legacy `kanbots/issue-*` branches, which are
  not renamed in place.
- Slash-command typeahead entries orchestrated by the app carry
  `source: 'kodra'` (was `'kanbots'`); no persisted data migration (pilot).
- The general-purpose chat system prompt identifies itself as the
  `kodra agent` (`KODRA_CHAT_CONTEXT` header).
- Repo ignore lists (`.gitignore`, `.prettierignore`, `eslint.config.mjs`)
  cover `.kodra/` alongside the legacy `.kanbots/` entry.
- Attachment storage (`attachments:upload`) and the promote temp-worktree
  path resolve through `describeKanbotsDir` (legacy-first) instead of
  hardcoding `.kanbots/` — previously a single attachment upload in a fresh
  `.kodra/` workspace recreated `.kanbots/` and hijacked the workspace root.

## Migration debt

- Screenshots in `docs/assets/` have not yet been recaptured; some still show
  the old Kanbots UI. Automated recapture was ruled out (native workspace
  picker dialog, per-user data in real boards). To recapture manually: run
  `pnpm desktop`, open the target workspace, frame approximately the same
  crops (board-overview is 1200x796; the others are 765-1128px wide) and
  overwrite the PNGs in `docs/assets/`.
- The `kanbots` npm package remains upstream-owned. Kodra does not currently
  have a separate npm package or install URL. **TODO: decide whether to
  publish a Kodra package and document its name.**
- No Kodra domain exists yet. Future Kodra URLs should be added only when
  they are available; until then, use this TODO rather than inventing a
  domain: **TODO: document the future Kodra website and install URL.**
- The fork repository name remains `kanbots`; packaged fork builds are
  planned for the fork's releases page but do not exist yet.
