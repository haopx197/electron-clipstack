#!/usr/bin/env bash
set -euo pipefail

REPO="haopx197/electron-clipstack"
APP_NAME="ClipStack"

# ANSI colors (fall back to no-color when stdout isn't a TTY).
if [[ -t 1 ]]; then
    C_BOLD="\033[1m"; C_DIM="\033[2m"; C_YELLOW="\033[33m"; C_GREEN="\033[32m"; C_RESET="\033[0m"
else
    C_BOLD=""; C_DIM=""; C_YELLOW=""; C_GREEN=""; C_RESET=""
fi

if [[ "$(uname)" != "Darwin" ]]; then
    echo "This installer is for macOS only." >&2
    exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
    arm64)  DMG="clipstack-arm64.dmg" ;;
    x86_64) DMG="clipstack-x64.dmg" ;;
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

echo ""
if [[ -d "/Applications/${APP_NAME}.app" ]]; then
    echo -e "${C_BOLD}Reinstalling ${APP_NAME} (${ARCH})${C_RESET}"
else
    echo -e "${C_BOLD}Installing ${APP_NAME} (${ARCH})${C_RESET}"
fi
echo -e "${C_DIM}Expected total time: 30 s – 2 min depending on your connection."
echo -e "  • Download DMG (~110 MB) — most of the wait."
echo -e "  • Mount, copy to /Applications, clear macOS quarantine.${C_RESET}"
echo ""

echo -e "${C_YELLOW}→${C_RESET} Downloading DMG… ${C_DIM}(largest step; progress below)${C_RESET}"
curl -fL --progress-bar "$URL" -o "$TMP_DMG"

echo -e "${C_YELLOW}→${C_RESET} Mounting DMG…"
MOUNT_POINT="$(hdiutil attach "$TMP_DMG" -nobrowse -readonly -mountrandom /tmp | grep -Eo '/tmp/[^ ]+' | tail -1)"

if [[ -z "$MOUNT_POINT" || ! -d "$MOUNT_POINT/${APP_NAME}.app" ]]; then
    echo "Failed to locate ${APP_NAME}.app in mounted DMG." >&2
    exit 1
fi

if [[ -d "/Applications/${APP_NAME}.app" ]]; then
    echo -e "${C_YELLOW}→${C_RESET} Removing previous install… ${C_DIM}(user data & clip history preserved)${C_RESET}"
    rm -rf "/Applications/${APP_NAME}.app"
fi

echo -e "${C_YELLOW}→${C_RESET} Copying to /Applications… ${C_DIM}(~5 s)${C_RESET}"
cp -R "$MOUNT_POINT/${APP_NAME}.app" /Applications/

# xattr -cr traverses ~2000 files inside the Electron bundle → 5-15 s.
echo -e "${C_YELLOW}→${C_RESET} Clearing macOS quarantine… ${C_DIM}(may take 5-15 s, don't cancel)${C_RESET}"
xattr -cr "/Applications/${APP_NAME}.app"

echo ""
echo -e "${C_GREEN}✅ ${APP_NAME} installed.${C_RESET}"
echo -e "   Launch from Launchpad or run: ${C_BOLD}open -a ${APP_NAME}${C_RESET}"
echo -e "   Grant Accessibility permission when the in-app banner asks."
