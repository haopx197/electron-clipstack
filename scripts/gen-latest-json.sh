#!/bin/bash
# Writes dist/latest.json with the current git short SHA. Runs at the end of
# `npm run build:mac` so the file sits next to the DMGs, ready to drag into the
# GitHub Release. The SHA must match __BUILD_SHA__ baked into the DMG — using
# the same `git rev-parse` command as electron.vite.config.ts keeps them aligned.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
OUT="$ROOT/dist/latest.json"

mkdir -p "$(dirname "$OUT")"
printf '{"sha":"%s"}\n' "$SHA" > "$OUT"
echo "Wrote $OUT ($(cat "$OUT"))"
