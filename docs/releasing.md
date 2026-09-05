# Releasing Kodra desktop

The desktop app ships as binary downloads on the
[Kodra releases page](https://github.com/vitorvaf/kodra/releases).
Builds are produced by two workflows: [`release-cut.yml`](../.github/workflows/release-cut.yml)
(bumps `packages/desktop` version, commits, pushes tag `v*`) and
[`release-build.yml`](../.github/workflows/release-build.yml)
(three-OS matrix build triggered by the tag). Releases are published
immediately — **not** drafts — because electron-updater only sees
published releases.

## Cutting a release

Preferred: run **release-cut** from the Actions tab (choose
`patch` / `minor` / `major`). It bumps `packages/desktop/package.json`,
commits `chore(release): v<version>`, tags `v<version>`, and pushes.

Manual alternative (same result):

```sh
cd packages/desktop
npm version patch -m "chore(release): v%s"
cd ../..
git push --follow-tags origin main
```

The tag then triggers `release-build.yml`, which:

1. Boots `ubuntu-latest`, `macos-latest`, and `windows-latest` runners in
   parallel.
2. Installs deps with pnpm (corepack, pinned by `packageManager`).
3. Runs `pnpm --filter @kanbots/desktop run build` then
   `electron-builder --<platform> --publish always`.
4. Publishes artifacts + `latest*.yml` update metadata to a **published**
   release named after the tag (all three runners append to the same
   release). On failure, each runner uploads its `release/*` directory as
   a workflow artifact (retained 14 days) for debugging.

## Artifact naming

Artifacts use a stable, predictable scheme so direct download links from
the marketing site keep working across versions:

| Platform | File | Notes |
| --- | --- | --- |
| Linux x64 | `kodra-<version>-linux-x64.AppImage` | Make executable: `chmod +x kodra-<v>-linux-x64.AppImage`. |
| Linux x64 | `kodra-<version>-linux-x64.tar.xz` | Extract anywhere; run `./kodra`. |
| macOS arm64 | `kodra-<version>-mac-arm64.dmg` | Apple Silicon (M1+). |
| macOS arm64 | `kodra-<version>-mac-arm64.zip` | For auto-update use; same payload as `.dmg`. |
| macOS x64 | `kodra-<version>-mac-x64.dmg` | Intel Macs. |
| macOS x64 | `kodra-<version>-mac-x64.zip` | For auto-update use; same payload as `.dmg`. |
| Windows x64 | `kodra-<version>-win-x64.exe` | NSIS installer (recommended). |
| Windows x64 | `kodra-<version>-win-x64.exe` | Portable build (different artifact ID). |

`releases/latest/download/<file>` resolves to the newest published
release, so the marketing site can hardcode these names.

## Unsigned builds — what users will see

We do not yet code-sign macOS or Windows builds (Apple Developer ID and
EV codesigning certificates are paid; we'll add them when revenue
covers it). The runtime impact:

### macOS

The exact Gatekeeper message depends on the macOS version:

- macOS 14 and earlier: _"Kodra cannot be opened because Apple cannot
  check it for malicious software."_ Bypassed by right-click → **Open**.
- macOS 15+ (incl. macOS 26 / Tahoe): _"Kodra is damaged and can't
  be opened. You should move it to the Trash."_ Right-click → **Open**
  no longer works on this wording; the only manual workaround is the
  `xattr` command below.

The Kodra fork does not yet ship an install script. Packaged fork builds
and their installation flow are planned for the fork releases page.

Users who prefer a manual install:

1. Right-click the app, choose **Open**, then click **Open** again
   (only works on macOS 14 and earlier).
2. From a terminal:
   ```sh
   xattr -dr com.apple.quarantine "/Applications/Kodra.app"
   ```

### Windows

> Microsoft Defender SmartScreen prevented an unrecognized app from
> starting.

The user clicks **More info** → **Run anyway**.

We document both flows in
[`docs/getting-started.md`](getting-started.md) so users know what to
expect.

### Future: signing & notarization

When we sign:

- **macOS**: Apple Developer ID + notarization. Set
  `CSC_LINK` (Developer ID Application certificate as base64),
  `CSC_KEY_PASSWORD`, plus `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` /
  `APPLE_TEAM_ID` for notarization. Remove the
  `CSC_IDENTITY_AUTO_DISCOVERY: "false"` env var from the workflow.
- **Windows**: EV code-signing certificate. Set `CSC_LINK` and
  `CSC_KEY_PASSWORD` similarly. EV certs warm up SmartScreen reputation
  immediately; non-EV certs build reputation over time.

## Auto-update

Implemented via `electron-updater` (see `packages/desktop/src/updater.ts`):

- On packaged builds only (`app.isPackaged`), the app checks for updates
  30s after launch and every 6h after that. Updates download in the
  background (`autoDownload`) and install silently on quit
  (`autoInstallOnAppQuit`).
- The renderer surfaces state over IPC (`updater:changed` event,
  `updaterGetState` / `updaterCheck` / `updaterInstall` methods): a quiet
  progress pill while downloading, and a toast offering **Restart now**
  once the update is downloaded. Everything else stays invisible.
- Feed: embedded `app-update.yml` (GitHub provider, `vitorvaf/kodra`).
  Override with `KODRA_UPDATE_FEED_URL` (or legacy `KANBOTS_UPDATE_FEED_URL`)
  pointing at a generic static host (e.g. a public bucket mirroring
  `latest*.yml` + artifacts) — see the note below.
- Platform notes: Windows NSIS and Linux AppImage update fully
  automatically (differential downloads via blockmap). macOS can only
  *detect* updates while builds are unsigned — Squirrel.Mac requires a
  signed bundle to install; signing is the prerequisite for silent mac
  updates. `tar.xz` is a portable target with no self-update.

> **Private-repo caveat**: the repo is private, and electron-updater's
> GitHub provider needs an unauthenticated feed. Until the repo is made
> public (or a `KODRA_UPDATE_FEED_URL` static mirror is set up), the
> updater will report errors on clients — silently by design — while the
> installer downloads keep working for anyone with repo access.

## What if the workflow fails?

Each runner uploads its `release/*` directory as a workflow artifact
(retained 14 days), even on failure. Open the failed job, download the
artifact, inspect locally. Common breakers:

- **better-sqlite3 prebuild missing for Electron `<x>`** — bump
  `electron` to a version with prebuilt `better-sqlite3` binaries, or
  pin `better-sqlite3` to a version that has prebuilds for the current
  Electron.
- **macOS x64 build fails on macos-latest (arm64 host)** — Apple Silicon
  runners cross-build x64 .dmgs; if an upstream tool starts requiring
  Rosetta, install it explicitly:
  `softwareupdate --install-rosetta --agree-to-license`.
- **electron-builder can't find a draft release to attach to** — usually
  means `GH_TOKEN` is missing or the tag isn't on the same branch as the
  workflow run. The workflow uses `secrets.GITHUB_TOKEN` which has
  `contents: write` per the `permissions:` block.
