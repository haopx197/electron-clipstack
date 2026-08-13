#!/usr/bin/env bash
set -euo pipefail

REPO="haopx197/electron-clipstack"
APP_NAME="ClipStack"
VERSION="1.0.0"

if [[ "$(uname)" != "Darwin" ]]; then
    echo "This installer is for macOS only." >&2
    exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
    arm64)  DMG="clipstack-${VERSION}-arm64.dmg" ;;
    x86_64) DMG="clipstack-${VERSION}-x64.dmg" ;;
    *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

URL="https://github.com/${REPO}/releases/latest/download/${DMG}"
TMP_DMG="$(mktemp -t clipstack).dmg"
MOUNT_POINT=""

cleanup() {
    if [[ -n "$MOUNT_POINT" && -d "$MOUNT_POINT" ]]; then
        hdiutil detach "$MOUNT_POINT" -quiet -force 2>/dev/null || true
    fi
    rm -f "$TMP_DMG"
}
trap cleanup EXIT

echo "→ Downloading ${APP_NAME} (${ARCH})..."
curl -fL --progress-bar "$URL" -o "$TMP_DMG"

echo "→ Mounting DMG..."
MOUNT_POINT="$(hdiutil attach "$TMP_DMG" -nobrowse -readonly -mountrandom /tmp | grep -Eo '/tmp/[^ ]+' | tail -1)"

if [[ -z "$MOUNT_POINT" || ! -d "$MOUNT_POINT/${APP_NAME}.app" ]]; then
    echo "Failed to locate ${APP_NAME}.app in mounted DMG." >&2
    exit 1
fi

if [[ -d "/Applications/${APP_NAME}.app" ]]; then
    echo "→ Removing previous install..."
    rm -rf "/Applications/${APP_NAME}.app"
fi

echo "→ Copying to /Applications..."
cp -R "$MOUNT_POINT/${APP_NAME}.app" /Applications/

echo "→ Clearing quarantine attribute..."
xattr -cr "/Applications/${APP_NAME}.app"

echo ""
echo "✅ ${APP_NAME} installed."
echo "   Launch from Launchpad or run: open -a ${APP_NAME}"
echo "   Grant Accessibility permission when macOS asks."
