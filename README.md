# ClipStack

A clipboard history manager for macOS, inspired by the Windows 11 Clipboard History (`Win+V`). Built with Electron + TypeScript + React + a Swift helper for native pasteboard and paste simulation.

## Features

- Global hotkey (default `⌘⇧V`) opens a small window under the tray icon.
- Captures text, images, files (from Finder), and URL bookmarks.
- Screenshots via `⌘⇧3/4/5` land in the clipboard automatically — ClipStack sets `defaults write com.apple.screencapture target clipboard` on first run.
- Pin items to keep them at the top; older unpinned items roll off past the configured cap (default 50, up to 200).
- Click an item to auto-paste (⌘V) into the app you were in.
- Custom hotkey and history cap in Settings.
- Menubar-only — no dock icon, no Cmd+Tab presence.

## Requirements

- macOS 11 Big Sur or later.
- Apple Silicon or Intel.
- **Accessibility permission** — required for auto-paste (Cmd+V simulation).

## Install (end user)

One-line install via curl. Bypasses Gatekeeper's "Apple could not verify" warning by fetching the DMG without the `com.apple.quarantine` attribute:

```bash
curl -fsSL https://github.com/haopx197/electron-clipstack/releases/latest/download/install.sh | bash
```

Then launch ClipStack from Launchpad. If Accessibility is not granted the app still runs; a banner in the window prompts you to grant it, and the app auto-restarts once permission flips on.

## Development

```bash
yarn                    # install deps (postinstall repairs Electron via ditto if extract-zip hangs)
yarn dev                # run in dev (electron-vite + Swift helper autobuild)
yarn build:mac          # build universal helper + arm64 + x64 DMGs into dist/
```

Build outputs:

```
dist/clipstack-1.0.0-arm64.dmg    # Apple Silicon
dist/clipstack-1.0.0-x64.dmg      # Intel
```

The Swift helper is a universal binary (arm64 + x64 slices via `lipo`), shipped in `resources/ClipStackHelper` and packed into `asarUnpack` so it stays executable at runtime.

## Releasing updates

ClipStack has a built-in silent updater. On launch it fetches `latest.json` from the GitHub Release, and if the embedded git SHA differs from the running build, an "Update available" section appears in Settings. Clicking **Install update** downloads the DMG, spawns a detached shell installer, quits the app, replaces `/Applications/ClipStack.app`, strips quarantine, and relaunches.

For this to work, each release must ship four files together:

- `clipstack-arm64.dmg` — Apple Silicon build
- `clipstack-x64.dmg` — Intel build
- `install.sh` — first-time installer referenced by the README's `curl` one-liner
- `latest.json` — `{ "sha": "abc1234", "notes": "..." }` consumed by the in-app updater

The `sha` must match `git rev-parse --short HEAD` at the commit used for the build (the same value is baked into the DMG via `__BUILD_SHA__`). GitHub only serves `releases/latest/download/<name>` from the newest release, so every release must include all four assets.

### One-time setup

```bash
brew install gh
gh auth login
```

### Every release

```bash
git commit -am "fix: something"
npm run build:mac                        # produces the two DMGs in dist/
npm run release -- -n "Fix something"    # generates latest.json + uploads all 3 files
```

`npm run release` runs [`scripts/release.sh`](scripts/release.sh) which tags `build-<sha>`, marks the release as latest, and uploads the DMGs + `latest.json` via `gh`. Omit `-n "..."` to use the last commit subject as release notes. Pass `--force` to overwrite an existing release with the same SHA.

Users running an older build see the update banner the next time they open the Settings tab (boot-time check, no polling).

## Signing and distribution

Builds are **unsigned** by default (`CSC_IDENTITY_AUTO_DISCOVERY=false` in `build:mac` scripts). This is intentional — no Apple Developer account needed. The install script (`scripts/install.sh`) mounts the DMG, copies `ClipStack.app` to `/Applications`, and runs `xattr -cr` to strip quarantine before first launch.

Do not add `identity: null` to `electron-builder.yml` or run `codesign --deep --force` manually — both break Electron's self-integrity check (`task_name_for_pid: (os/kern) failure (5)`).

## Regenerating the app icon

After replacing `build/icon.png` with a 1024×1024 PNG:

```bash
mkdir -p /tmp/icon.iconset
sips -z 16 16     build/icon.png --out /tmp/icon.iconset/icon_16x16.png
sips -z 32 32     build/icon.png --out /tmp/icon.iconset/icon_16x16@2x.png
sips -z 32 32     build/icon.png --out /tmp/icon.iconset/icon_32x32.png
sips -z 64 64     build/icon.png --out /tmp/icon.iconset/icon_32x32@2x.png
sips -z 128 128   build/icon.png --out /tmp/icon.iconset/icon_128x128.png
sips -z 256 256   build/icon.png --out /tmp/icon.iconset/icon_128x128@2x.png
sips -z 256 256   build/icon.png --out /tmp/icon.iconset/icon_256x256.png
sips -z 512 512   build/icon.png --out /tmp/icon.iconset/icon_256x256@2x.png
sips -z 512 512   build/icon.png --out /tmp/icon.iconset/icon_512x512.png
cp                build/icon.png     /tmp/icon.iconset/icon_512x512@2x.png
iconutil -c icns /tmp/icon.iconset -o build/icon.icns
rm -rf /tmp/icon.iconset
```

## Recommended IDE

VSCode + ESLint + Prettier.

## License

Not published under an OSS license yet.
