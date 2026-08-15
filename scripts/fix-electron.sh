#!/usr/bin/env bash
# Workaround: node's `extract-zip` (used by electron npm package) hangs when
# extracting the electron zip on some Node versions → node_modules/electron/dist/
# ends up with only LICENSES.chromium.html and no Electron.app. Re-running
# `yarn install` doesn't fix it. Use `ditto` (macOS native) to extract from cache zip.
#
# Detect: skip if path.txt exists and Electron.app is present.
# Fix: extract from ~/Library/Caches/electron/*/electron-v<ver>-darwin-<arch>.zip

set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
    exit 0
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_DIR="$ROOT/node_modules/electron"

if [[ ! -d "$ELECTRON_DIR" ]]; then
    exit 0
fi

if [[ -f "$ELECTRON_DIR/path.txt" && -d "$ELECTRON_DIR/dist/Electron.app" ]]; then
    exit 0
fi

VERSION="$(node -p "require('$ELECTRON_DIR/package.json').version")"
ARCH="$(uname -m)"
case "$ARCH" in
    arm64) ZIP_ARCH="arm64" ;;
    x86_64) ZIP_ARCH="x64" ;;
    *) echo "[fix-electron] unsupported arch $ARCH" >&2; exit 0 ;;
esac

CACHE="$HOME/Library/Caches/electron"
ZIP="$(find "$CACHE" -name "electron-v${VERSION}-darwin-${ZIP_ARCH}.zip" -print -quit 2>/dev/null || true)"

if [[ -z "$ZIP" || ! -f "$ZIP" ]]; then
    echo "[fix-electron] no cached zip for v${VERSION} ${ZIP_ARCH}, skip (yarn install may need to run first)" >&2
    exit 0
fi

echo "[fix-electron] re-extracting Electron ${VERSION} from cache via ditto..."
rm -rf "$ELECTRON_DIR/dist"
mkdir -p "$ELECTRON_DIR/dist"
ditto -xk "$ZIP" "$ELECTRON_DIR/dist"
printf "Electron.app/Contents/MacOS/Electron" > "$ELECTRON_DIR/path.txt"
echo "[fix-electron] done."
