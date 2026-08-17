#!/bin/bash
# Wraps the raw ClipStackHelper Mach-O binary into a proper macOS `.app`
# bundle so:
#   1. The Accessibility list in System Settings shows the ClipStack icon
#      instead of the generic Terminal / executable placeholder.
#   2. TCC identifies the helper by a stable CFBundleIdentifier
#      (com.clipstack.helper) instead of the raw path, so the grant persists
#      across rebuilds even when the binary hash changes.
#
# Inputs (both must exist before running):
#   $1 → path to the compiled Mach-O binary (input; will be moved into bundle)
#   $2 → path to the icon .icns file (copied into Resources)
#
# Output:
#   Replaces the input binary path with a `.app` directory at the same
#   basename (input `resources/ClipStackHelper` → output
#   `resources/ClipStackHelper.app/Contents/MacOS/ClipStackHelper`).
set -e

BIN="${1:?binary path required}"
ICON="${2:?icon path required}"

[[ -f "$BIN" ]] || { echo "[wrap-helper] missing binary: $BIN" >&2; exit 1; }
[[ -f "$ICON" ]] || { echo "[wrap-helper] missing icon: $ICON" >&2; exit 1; }

APP="${BIN}.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

mv "$BIN" "$APP/Contents/MacOS/$(basename "$BIN")"
cp "$ICON" "$APP/Contents/Resources/icon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.clipstack.helper</string>
    <key>CFBundleName</key>
    <string>ClipStack</string>
    <key>CFBundleDisplayName</key>
    <string>ClipStack</string>
    <key>CFBundleExecutable</key>
    <string>$(basename "$BIN")</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSUIElement</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
</dict>
</plist>
PLIST
# NOTE: intentionally no LSBackgroundOnly. Both keys hide the helper from the
# Dock, but LSBackgroundOnly signals "pure daemon, do not fully register",
# which stops Launch Services from indexing the bundle — so mdls returns null
# for CFBundleIdentifier, System Settings can't find the icon, and the entry
# in Accessibility shows the generic executable placeholder instead of the
# ClipStack icon. LSUIElement alone hides from the Dock while still allowing
# full registration.

echo "[wrap-helper] wrapped → $APP"
