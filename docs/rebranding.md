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
- environment variables beginning with `KANBOTS_`
- executable: `kanbots-mcp-server`
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
