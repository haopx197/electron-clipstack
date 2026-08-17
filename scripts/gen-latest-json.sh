#!/bin/bash
# Writes dist/latest.json with the build identifier baked into the compiled
# main bundle. Runs at the end of `npm run build:mac` so the file sits next to
# the DMGs, ready to drag into the GitHub Release.
#
# We *read* the SHA from `out/main/index.js` rather than recomputing it, because
# electron.vite.config.ts generated a `<sha>-<timestamp>` identifier at build
# START and the timestamp would drift if we called `date` again here. Reading
# from the compiled bundle guarantees latest.json === DMG's __BUILD_SHA__.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIN_JS="$ROOT/out/main/index.js"
OUT="$ROOT/dist/latest.json"

if [[ ! -f "$MAIN_JS" ]]; then
    echo "[error] $MAIN_JS not found - run electron-vite build first" >&2
    exit 1
fi

SHA="$(sed -nE 's/.*CURRENT_SHA = "([^"]+)".*/\1/p' "$MAIN_JS" | head -1)"
if [[ -z "$SHA" ]]; then
    echo "[error] Could not extract CURRENT_SHA from $MAIN_JS" >&2
    exit 1
fi

mkdir -p "$(dirname "$OUT")"
printf '{"sha":"%s"}\n' "$SHA" > "$OUT"
echo "Wrote $OUT ($(cat "$OUT"))"
