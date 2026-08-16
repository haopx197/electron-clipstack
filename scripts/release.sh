#!/usr/bin/env bash
# Publish a ClipStack release to GitHub:
#   1. Reads current git short SHA (matches __BUILD_SHA__ baked into the DMG).
#   2. Generates latest.json with { sha, notes }.
#   3. Creates a GitHub release tagged `build-<sha>` and uploads:
#        - dist/clipstack-arm64.dmg
#        - dist/clipstack-x64.dmg
#        - latest.json               (in-app updater reads this)
#        - install.sh                (curl-piped installer, referenced by README)
#
# Requires: gh (authenticated), a prior `npm run build:mac` producing the DMGs.
#
# Usage:
#   scripts/release.sh                          # notes = last commit subject
#   scripts/release.sh -n "Fix paste on Chrome" # explicit notes
#   scripts/release.sh --force                  # overwrite existing release
set -euo pipefail

REPO_SLUG="haopx197/electron-clipstack"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
ARM_DMG="$DIST/clipstack-arm64.dmg"
X64_DMG="$DIST/clipstack-x64.dmg"
LATEST_JSON="$DIST/latest.json"
INSTALL_SH="$ROOT/scripts/install.sh"

NOTES=""
FORCE=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        -n|--notes) NOTES="$2"; shift 2 ;;
        --force) FORCE=1; shift ;;
        -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

command -v gh >/dev/null || { echo "gh CLI not found. Install: brew install gh" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated. Run: gh auth login" >&2; exit 1; }

[[ -f "$ARM_DMG" ]]    || { echo "Missing $ARM_DMG - run: npm run build:mac" >&2; exit 1; }
[[ -f "$X64_DMG" ]]    || { echo "Missing $X64_DMG - run: npm run build:mac" >&2; exit 1; }
[[ -f "$INSTALL_SH" ]] || { echo "Missing $INSTALL_SH" >&2; exit 1; }

SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
TAG="build-${SHA}"

if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
    echo "[warn] Working tree is dirty. The DMG's baked SHA may not match HEAD." >&2
    echo "       Continue anyway? [y/N]"
    read -r ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || exit 1
fi

if [[ -z "$NOTES" ]]; then
    NOTES="$(git -C "$ROOT" log -1 --pretty=%s)"
fi

# Escape backslash and double-quote for JSON. Control chars in release notes
# are vanishingly rare and not worth a jq dependency.
esc_json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

mkdir -p "$DIST"
printf '{ "sha": "%s", "notes": "%s" }\n' "${SHA}" "$(esc_json "$NOTES")" > "$LATEST_JSON"

echo "Release tag: ${TAG}"
echo "Notes:       ${NOTES}"
echo "latest.json: $(cat "$LATEST_JSON")"
echo ""

if gh release view "${TAG}" --repo "$REPO_SLUG" >/dev/null 2>&1; then
    if [[ "$FORCE" -ne 1 ]]; then
        echo "Release ${TAG} already exists. Re-run with --force to overwrite." >&2
        exit 1
    fi
    echo "-> Deleting existing release ${TAG}"
    gh release delete "${TAG}" --repo "$REPO_SLUG" --yes --cleanup-tag
fi

echo "-> Creating release ${TAG} with small assets"
# Upload the tiny files first so the release object exists; then push the two
# DMGs in parallel. gh's default sequential upload doubles wall-clock time
# because DMGs are ~110 MB each.
gh release create "${TAG}" \
    --repo "$REPO_SLUG" \
    --title "ClipStack ${TAG}" \
    --notes "$NOTES" \
    --latest \
    "$LATEST_JSON" "$INSTALL_SH"

echo "-> Uploading DMGs in parallel"
gh release upload "${TAG}" --repo "$REPO_SLUG" "$ARM_DMG" & PID_ARM=$!
gh release upload "${TAG}" --repo "$REPO_SLUG" "$X64_DMG" & PID_X64=$!
FAIL=0
wait "$PID_ARM" || FAIL=1
wait "$PID_X64" || FAIL=1
if [[ "$FAIL" -ne 0 ]]; then
    echo "[error] One or more DMG uploads failed." >&2
    exit 1
fi

echo ""
echo "[ok] Published ${TAG}"
echo "     Users on older builds will see 'Update available' after they reopen ClipStack."
