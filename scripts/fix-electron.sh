#!/usr/bin/env bash
# Workaround: node's `extract-zip` (dùng bởi electron npm package) bị hang khi
# extract electron zip trên một số Node version → node_modules/electron/dist/
# chỉ có LICENSES.chromium.html, thiếu Electron.app. Chạy lại `yarn install`
# cũng không fix. Ta dùng `ditto` (macOS native) extract từ cache zip.
#
# Detect: nếu path.txt tồn tại và Electron.app có → skip.
# Fix: extract từ ~/Library/Caches/electron/*/electron-v<ver>-darwin-<arch>.zip

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
