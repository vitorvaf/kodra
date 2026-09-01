# kanbots — npx launcher

A one-command installer for the [kanbots](https://github.com/leodavinci1/kanbots)
desktop app: a kanban board that runs Claude Code and Codex agents in parallel.

```sh
npx kanbots
```

On first run, the installer grabs the right binary for your OS from the
[GitHub releases page](https://github.com/leodavinci1/kanbots/releases) (~80MB)
and launches the app. On subsequent runs the cached binary is launched
directly.

To pull the newest build:

```sh
npx kanbots@latest
```

## What the launcher does

1. **Postinstall** (`scripts/postinstall.js`) — detects your platform, downloads
   the matching release asset, and unpacks it into `vendor/<platform>/`.
2. **Launcher** (`bin/kanbots.js`) — locates the binary, spawns it with stdio
   inherited, and forwards `SIGINT`/`SIGTERM` so `Ctrl+C` works cleanly.

If the postinstall got skipped (some `npx` cache paths do this, as does
`npm install --ignore-scripts`), the launcher re-runs it once on demand.

## Supported platforms

| OS | Arch | Asset |
| --- | --- | --- |
| macOS | arm64 (Apple Silicon) | `kanbots-<version>-mac-arm64.zip` |
| macOS | x64 (Intel) | `kanbots-<version>-mac-x64.zip` |
| Linux | x64 | `kanbots-<version>-linux-x64.AppImage` |
| Windows | x64 | `kanbots-<version>-win-x64.exe` (manual install — see below) |

### macOS notes

The macOS builds are unsigned, so Gatekeeper quarantines them on first
download. The postinstall script clears the quarantine attribute
(`xattr -rd com.apple.quarantine`) automatically — the same step the
[install-mac.sh](https://kanbots.dev/install-mac.sh) one-liner does.

### Linux notes

The AppImage runs in place — no extraction needed. If it fails with a
"FUSE" error, install `libfuse2` (Ubuntu 22.04+) or run with `--appimage-extract-and-run`.

### Windows notes

Automated install isn't wired up for Windows yet — the `npx kanbots` flow on
Windows prints a download link to the NSIS installer. For now, grab the
`.exe` from the [releases page](https://github.com/leodavinci1/kanbots/releases)
and run it once; the app then launches like any installed Windows app.

## Environment variables

- `KANBOTS_SKIP_POSTINSTALL=1` — skip the binary download during
  `npm install`. Useful in CI environments that don't need the desktop app.

## Publishing this package

Don't publish from a dirty tree. After a GitHub release is published at
`v<version>` with all platform assets attached:

```sh
cd npx-cli
npm version <new-version> --no-git-tag-version
npm publish --access public
```

The version in `npx-cli/package.json` *is* the version the postinstall looks
for, so bump it to match the release tag exactly.

## License

MIT — see [LICENSE](../LICENSE) in the kanbots repo.
