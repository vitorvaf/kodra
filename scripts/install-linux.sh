#!/usr/bin/env bash
# Kodra desktop installer for Linux and WSL.
#
# Install (or reinstall/upgrade) with:
#   curl -fsSL https://raw.githubusercontent.com/vitorvaf/kodra/main/scripts/install-linux.sh | bash
#
# - Downloads the latest AppImage release into ~/.local/share/kodra/
# - Exposes it as `kodra` on ~/.local/bin (symlink, or an extract-and-run
#   wrapper when libfuse2 is missing — common on fresh WSL installs)
# - The symlink keeps in-place auto-updates working; the extract-and-run
#   wrapper runs from a temporary extraction and cannot self-update
set -euo pipefail

REPO="vitorvaf/kodra"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/kodra"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required (apt install curl)"

case "$(uname -m)" in
  x86_64) ARCH="x64" ;;
  aarch64 | arm64)
    die "No linux-arm64 builds are published yet — see https://github.com/$REPO/releases"
    ;;
  *) die "Unsupported architecture: $(uname -m)" ;;
esac

if grep -qi microsoft /proc/version 2>/dev/null; then
  say "WSL detected — the UI needs WSLg (built into Windows 11 and updated Windows 10)."
fi

say "Resolving latest release..."
TAG="$(
  curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
    sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
)"
[ -n "$TAG" ] || die "could not resolve the latest release (GitHub API rate limit? try again shortly)"
VER="${TAG#v}"
URL="https://github.com/$REPO/releases/download/$TAG/kodra-${VER}-linux-${ARCH}.AppImage"
say "Installing Kodra $VER"

mkdir -p "$INSTALL_DIR" "$BIN_DIR"
APP="$INSTALL_DIR/kodra.AppImage"
rm -f "$APP"
curl -fL --progress-bar -o "$APP" "$URL"
chmod +x "$APP"

rm -f "$BIN_DIR/kodra"
USED_WRAPPER=false
if ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
  ln -s "$APP" "$BIN_DIR/kodra"
else
  if command -v apt-get >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    say "Attempting to install libfuse2 for the fast self-updating path..."
    sudo apt-get install -y libfuse2 || true
  fi

  if ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
    ln -s "$APP" "$BIN_DIR/kodra"
  else
    # No libfuse2 (typical on fresh WSL): extract-and-run needs no FUSE.
    printf '#!/usr/bin/env bash\nexec %q --appimage-extract-and-run "$@"\n' "$APP" >"$BIN_DIR/kodra"
    chmod +x "$BIN_DIR/kodra"
    USED_WRAPPER=true
    say "WARNING: extract-and-run mode DISABLES in-app auto-updates (the app cannot replace its own AppImage from a temp extraction)."
    say "To enable auto-updates later: sudo apt install libfuse2 && re-run this installer (it will switch to a symlink)."
  fi
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) say "Note: $BIN_DIR is not on your PATH — add it: export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac

say "Done: kodra $VER installed ($BIN_DIR/kodra)"
if [ "$USED_WRAPPER" = true ]; then
  say "Run 'kodra' to start. Updates require re-running the installer after installing libfuse2 (or switching to the symlink)."
else
  say "Run 'kodra' to start. New versions download in the background and install when you quit the app."
fi
