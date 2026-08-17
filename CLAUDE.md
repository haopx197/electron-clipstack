# ClipStack — Engineering Notes

Clipboard history manager for macOS, inspired by the Windows 11 Clipboard History (`Win+V`). Electron + TypeScript + React shell, backed by a persistent Swift helper for native pasteboard and paste simulation.

Codebase language: source and comments are English. Docs are English.

## 1. Tech stack

| Layer            | Choice                                 | Reason                                                         |
| ---------------- | -------------------------------------- | -------------------------------------------------------------- |
| Shell            | Electron 39                            | Given requirement                                              |
| Language         | TypeScript                             | Type safety, easy maintenance                                  |
| Bundler          | `electron-vite` 5                      | Standard main/preload/renderer split, fast HMR                 |
| UI               | React 19 + styled-components           | Familiar, light enough for a small popover                     |
| Storage          | `electron-store` (JSON)                | Dataset ≤200 items, no search → SQLite not needed              |
| Packaging        | `electron-builder` 26 → `dmg`          | No App Store, no sign/notarize                                 |
| Auto paste       | `CGEvent` from Swift helper            | Same permission (Accessibility) shared with AX focus queries   |
| Native helpers   | Swift child process (`native/`)        | AX focus query, global mouse hook, NSPasteboard poll, CGEvent  |

## 2. Project layout

```
clipstack/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── native/
│   └── ClipStackHelper.swift      # Swift child: AX focus, mouse monitor, pb watch, paste
├── resources/
│   ├── trayIconTemplate.png       # 16×16 template icon (auto-tinted)
│   ├── trayIconTemplate@2x.png    # 32×32 retina
│   └── ClipStackHelper            # binary from build:helper:universal (arm64+x64 lipo)
├── build/
│   ├── icon.icns / icon.png / icon.ico
│   └── entitlements.mac.plist     # JIT + unsigned-executable-memory + dyld-env-vars
├── scripts/
│   ├── install.sh                 # curl | bash installer (strips quarantine)
│   └── fix-electron.sh            # postinstall workaround for extract-zip hang
├── src/
│   ├── shared/
│   │   ├── types.ts                # ClipboardItem, AppSettings, constants
│   │   └── ipc.ts                  # channel names shared main/preload
│   ├── main/
│   │   ├── index.ts                # entry, wiring, single-instance lock
│   │   ├── store.ts                # electron-store: items + settings
│   │   ├── images.ts               # save/delete PNG in userData/clip-images
│   │   ├── clipboardWatcher.ts     # capture flow, format sniff, dedup
│   │   ├── helper.ts               # Swift helper IPC (line protocol over stdio)
│   │   ├── windowManager.ts        # single BrowserWindow, showInactive, position under tray
│   │   ├── tray.ts                 # tray icon + context menu
│   │   ├── hotkey.ts               # global shortcut register + change with rollback
│   │   ├── screencapture.ts        # session-scoped: sets Cmd+Shift+3/4/5 target = clipboard when setting ON; restores on quit
│   │   └── ipcHandlers.ts          # ipcMain handlers + broadcast
│   ├── preload/
│   │   ├── index.ts                # contextBridge, exposes window.clipstack API
│   │   └── index.d.ts              # renderer-side type for window.clipstack
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx             # AccessibilityBanner + TabView
│           ├── globalStyles.ts
│           ├── components/         # Button, Input, Empty, Typography, AccessibilityBanner…
│           ├── modules/            # TabView, ClipboardTab, ClipboardItemRow, IconsTab, SettingsTab
│           └── SVGs/               # icon components
```

## 3. Data model (`src/shared/types.ts`)

```ts
type ClipboardItemType = "text" | "image" | "bookmark" | "file";

type ClipboardItem = {
    id: string;
    type: ClipboardItemType;
    /**
     * Primary payload:
     *   text     — raw text
     *   image    — absolute path in userData/clip-images
     *   bookmark — URL
     *   file     — absolute path to user-owned file (not managed by ClipStack)
     */
    content: string;
    preview?: string;         // plain-text preview for bookmark
    bookmarkTitle?: string;
    fileName?: string;        // cached basename for type "file"
    pinned: boolean;
    createdAt: number;        // for sorting within the unpinned group
};

type AppSettings = {
    hotkey: string;                             // Electron accelerator string
    maxClips: number;                           // clamped to [MIN_MAX_CLIPS, MAX_MAX_CLIPS]
    captureScreenshotsToClipboard: boolean;     // when true, sets defaults com.apple.screencapture target=clipboard while running
};

const DEFAULT_HOTKEY = "Command+Shift+V";
const DEFAULT_WINDOW_SIZE = { width: 400, height: 500 };
const DEFAULT_MAX_CLIPS = 50;
const DEFAULT_CAPTURE_TO_CLIPBOARD = true;
const MIN_MAX_CLIPS = 1;
const MAX_MAX_CLIPS = 200;
```

**Display order** — everywhere a list is returned to the renderer:
`[...pinned items] + [...unpinned items, newest first]`
→ a fresh copy always sits right under the pinned group, never inserted between pinned items.

## 4. IPC contract (`src/shared/ipc.ts`)

| Channel                                  | Direction                    | Payload → Return                                                       |
| ---------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `clipboard:get-items`                    | renderer → main (invoke)     | `()` → `ClipboardItem[]` (pinned first)                                |
| `clipboard:paste-item`                   | renderer → main (invoke)     | `(id)` → write clipboard + hide window + simulate paste                |
| `clipboard:pin-item`                     | renderer → main (invoke)     | `(id)` → toggle pinned → new `ClipboardItem[]`                         |
| `clipboard:delete-item`                  | renderer → main (invoke)     | `(id)` → delete item (+ PNG file if image) → new `ClipboardItem[]`     |
| `clipboard:clear-all`                    | renderer → main (invoke)     | `()` → delete unpinned only (+ their PNGs) → new `ClipboardItem[]`     |
| `clipboard:items-updated`                | main → renderer (push)       | fires whenever the watcher captures a new item                         |
| `settings:get-hotkey`                    | renderer → main (invoke)     | `()` → `string`                                                        |
| `settings:set-hotkey`                    | renderer → main (invoke)     | `(accelerator)` → `{ ok: boolean; error?: string }`                    |
| `settings:get-max-clips`                 | renderer → main (invoke)     | `()` → `number`                                                        |
| `settings:set-max-clips`                 | renderer → main (invoke)     | `(n)` → `{ maxClips, items }` (trims to cap, deletes dropped PNGs)     |
| `settings:get-capture-to-clipboard`      | renderer → main (invoke)     | `()` → `boolean`                                                       |
| `settings:set-capture-to-clipboard`      | renderer → main (invoke)     | `(value)` → applies to macOS + persists → `boolean` (applied value)    |
| `window:hide`                            | renderer → main (invoke)     | `()` → hide window (used by Esc key)                                   |
| `system:accessibility-status`            | renderer → main (invoke)     | `()` → `boolean` (check-only, no native prompt)                        |
| `system:accessibility-changed`           | main → renderer (push)       | fires on `com.apple.accessibility.api` distributed notification        |
| `system:open-accessibility-settings`     | renderer → main (invoke)     | `()` → opens System Settings → Privacy & Security → Accessibility      |
| `system:relaunch`                        | renderer → main (invoke)     | `()` → `app.relaunch()` + `exit(0)` (no-op in dev)                     |
| `updates:get-status`                     | renderer → main (invoke)     | `()` → `UpdateStatus` (`{ hasUpdate }`)                                |
| `updates:install`                        | renderer → main (invoke)     | `()` → download DMG, spawn detached installer, quit app                |
| `updates:status-updated`                 | main → renderer (push)       | `UpdateStatus` — fires when the boot-time check finishes                |
| `updates:install-progress`               | main → renderer (push)       | `UpdateInstallProgress` (`{ phase, percent, error }`)                  |

## 5. Main process — module behaviour

### `clipboardWatcher.ts`

macOS has no OS-level clipboard-change notification; every clipboard manager (native or not) polls `NSPasteboard.changeCount`. ClipStack does this via the Swift helper:

- **Primary**: helper's DispatchSource background timer at 100ms, only notifies Node when `changeCount` changes → ~0 CPU + no log spam.
- **Fallback**: if the helper is unavailable (missing binary / crashed / Accessibility denied), Node polls with `setInterval(poll, 400ms)`.

Capture pipeline (`captureCurrent`), priority order:
1. **File URL** — `public.file-url` present. Uses helper's `pb-files` (NSURL-resolved POSIX paths, handles `/.file/id=<inode>`). If the file is an image and format is renderable by Chromium `<img>`, save as image; TIFF/HEIC → convert via `nativeImage` → PNG; otherwise store as `type: "file"`.
2. **Image data** — try helper's `pb-image` (PNG dumped from `NSImage`, catches Chrome/browser OSType flavors Electron misses), then `clipboard.readImage()`.
3. **Bookmark** — only if `public.url-name` present (Safari attaches it). Plain URL text goes through step 4.
4. **Text** — plain text preferred; HTML-only → strip tags → text. RTF-only skipped (no parser). Single-URL text → `type: "bookmark"` with no title.

Format sniffing uses magic bytes (never trust extension). Text dedup by string; images dedup by SHA-1 of PNG bytes. Repeated copies bump `createdAt` instead of creating duplicates.

Before the app writes the clipboard itself (during paste), `markClipboardAsCurrent()` sets `suppressUntilMs = Date.now() + 800`. Any capture within that window is silently swallowed (its signature is still updated so we resume dedup after). Time-based rather than consume-once because a paste may trigger multiple `changeCount` bumps (`writeText` + `writeBuffer`) and the helper's multi-phase wait needs coverage.

### `store.ts`

- `addItem`, `pinItem`, `deleteItem`, `clearAll`, `getItems` — return sorted (pinned first).
- Cap: when the unpinned list exceeds `settings.maxClips`, the oldest unpinned items are dropped. If a dropped item is an image, its PNG file is deleted (`cleanupOwnedFiles`).
- `deleteItem` / `clearAll` do the same PNG cleanup.
- `clearAll` keeps pinned items untouched.
- One-shot migration on load: legacy `type: "html"` / `type: "rtf"` items are converted to `type: "text"` in place.

### `images.ts`

- `saveImage(nativeImage)` writes PNG at `userData/clip-images/<uuid>.png`, returns absolute path.
- `saveImageBytes(bytes, ext)` writes raw bytes with the original extension (SVG / GIF need this — nativeImage can't parse SVG, and encoding GIF drops animation).
- `deleteImageFile(path)` — best-effort unlink.

### `windowManager.ts`

- Single `BrowserWindow` doubles as popover and manager (no separate windows).
- `frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `movable: false`, non-resizable.
- **Do NOT** use `type: 'panel'` — Electron 39 warns `NSWindow does not support nonactivating panel styleMask 0x80` with `frame: false`.
- Show via `showInactive()` (not `show()` + `focus()`): order-front without becoming key window → the app the user is typing in keeps focus and caret.
- When a paste happens, Electron temporarily activates ClipStack when the item is clicked. `ipcHandlers.ts` calls `app.hide()` after writing the clipboard, then awaits `did-resign-active` (macOS restores the previous frontmost) before `simulatePasteViaHelper()`. 200ms timeout fallback avoids hangs.
- **No blur handler.** blur fires non-deterministically on macOS (menubar activation from tray click, showInactive edge cases) and races with tray.click. All close paths are explicit: item click, mouse-monitor outside click, tray toggle, hotkey toggle, Esc.
- Visible state tracked via a module-level `visible` bool. Do NOT rely on `mainWindow.isVisible()` — after `showInactive()`/`hide()` the AppKit `[NSWindow isVisible]` return lags a few ms → rapid tray clicks read stale state.

### Window show/hide spec

1. **Open** via hotkey (default `⌘⇧V`) or tray click.
   - **Position**: window spawns bottom-right of the current cursor with a 4px gap (`positionNearCursor` in `windowManager.ts`). If bottom-right would clip off-screen, flips to top-left of the cursor; final clamp keeps it inside `display.workArea`.
   - After show, the user can drag the window by the top `DragHandle` strip (renderer component, `-webkit-app-region: drag`). Position is NOT persisted — every `show()` resets to cursor.
   - Uses `showInactive()` → the user's typing keeps focus/caret.
2. **Close** — four explicit paths:
   - Click an item → paste + hide.
   - Click outside the window (helper's global mouse monitor emits `click:<x>,<y>`; main checks bounds and hides if outside window and outside the menubar strip).
   - Press hotkey again or click tray again → toggle.
   - Press `Esc` while the window is key → hide via IPC.
3. **No blur handler** — root cause of the historical tray-toggle bug. Trade-off: Cmd+Tab doesn't auto-close ClipStack (acceptable — user can click out or press Esc).

### `helper.ts` + `native/ClipStackHelper.swift`

Persistent Swift child spawned once at boot, line-based protocol over stdin/stdout. One Accessibility grant powers three features:

- **Global mouse monitor** — `NSEvent.addGlobalMonitorForEvents([.leftMouseDown, .rightMouseDown, .otherMouseDown])`. Each click emits `click:<x>,<y>` (NSEvent bottom-left coords; Node flips to top-left using primary display height).
- **Pasteboard change watch** — `DispatchSource.makeTimerSource` polling `NSPasteboard.general.changeCount` at 100ms on a utility queue. Emits `pb-files:` and `pb-image:` (always, even empty, to clear Node cache), then `clipboard-changed:<n>`.
- **Paste** — activates the last non-self target (tracked live via `NSWorkspace.didActivateApplication`), polls `isActive == true` (hard-stop 300ms), then posts `Cmd-down` / `V-down` / `V-up` / `Cmd-up` as `CGEvent`s. Explicit modifier sequence is required — several Chromium/Electron apps ignore Cmd flag on V alone.
- **AX trust query** — `ax-status` command returns `ax-status:true|false` from `AXIsProcessTrusted()`. Used by the banner in place of `systemPreferences.isTrustedAccessibilityClient` (the .app and the helper are separate TCC identities — the helper's is the one that determines whether paste works).
- **AX change events** — the helper subscribes to `com.apple.accessibility.api` on `NSDistributedNotificationCenter` and emits `ax-changed` when it fires. Subscription lives in the helper (not in Electron main) so nothing in `com.clipstack.app` touches AX-adjacent APIs — that keeps the parent bundle from being registered as an AX-eligible client and showing up as a phantom entry in System Settings.

Chrome/browser copies are multi-phase: `declareTypes` may run twice ~100-200ms apart. `waitForPasteboardReady` waits up to 500ms for types to appear, then if the source looks browser-origin (`org.chromium.` / `com.apple.WebKit.` / `com.microsoft.Edge.` UTIs) up to 200ms more for the image phase. This coalesces "1 copy → 2 items" into a single emit.

Build: `npm run build:helper:universal` runs `swiftc` twice (arm64 + x86_64), `lipo` merges, then [`scripts/wrap-helper-app.sh`](scripts/wrap-helper-app.sh) wraps the binary into `resources/ClipStackHelper.app` — a proper macOS bundle with `CFBundleIdentifier=com.clipstack.helper` and the ClipStack icon copied from `build/icon.icns`. Wrapping serves two goals: (a) the entry in System Settings → Accessibility shows the ClipStack icon instead of the generic Terminal placeholder raw executables get, and (b) TCC keys the grant on the stable bundle identifier so the grant survives rebuilds even when the Mach-O hash changes.

**Bundle placement**: electron-builder's `extraFiles` copies `ClipStackHelper.app` to `Contents/Frameworks/` in the packaged .app. This location matters — Launch Services indexes standard helper directories (Frameworks/, Library/LoginItems/, etc.) but NOT nested paths like `Contents/Resources/app.asar.unpacked/`. A .app that Launch Services can't index shows up with the generic executable icon even if its Info.plist declares one; putting it in Frameworks/ is what actually makes the ClipStack icon appear.

Path resolution (production vs dev): main tries `<Contents>/Frameworks/ClipStackHelper.app/Contents/MacOS/ClipStackHelper` first (packaged) then `resources/ClipStackHelper.app/...` (dev, from project root).

If the binary isn't present or Accessibility isn't granted, the helper still spawns but paste doesn't work, mouse monitor returns nil, and clipboard watch works but Node falls back to `setInterval`.

**AX registration priming** — at boot, main sends `mouse-start` + `mouse-stop` back-to-back with a no-op callback. `addGlobalMonitorForEvents` records a TCC request even when it returns nil, so this dance is what makes `ClipStackHelper` appear in the Accessibility list from first launch. Without it, the helper only shows up in the pane *after* the user first opens the window (`windowManager.showWindow` → `startMouseMonitor`) — meaning a user who clicks "Open Settings" from the banner immediately after install would see an empty list with nothing to toggle.

### `tray.ts`

- Loads icon from `resources/trayIconTemplate.png` (+ `@2x.png`). The `Template` suffix tells macOS to auto-tint monochrome (must be black + alpha only; any coloured pixels will render wrong in dark mode).
- `tray.setIgnoreDoubleClickEvents(true)` — every physical tap fires `click` immediately, no ~250ms debounce.
- Left-click → `toggleWindow()`. Right-click → context menu (`Show ClipStack`, `Quit`).

### `hotkey.ts`

- `registerHotkey()` on boot from stored settings.
- `changeHotkey(accelerator)` unregisters the current one, tries the new one; on failure (already-used / invalid) rolls back to the previous binding and returns `{ ok: false, error }`.

### `screencapture.ts`

Session-scoped mutation of `com.apple.screencapture target`. Controlled by the `captureScreenshotsToClipboard` setting (default `true`).

- `applyCaptureToClipboard(enabled)` — called on `whenReady` with the persisted setting, and again from the Settings toggle IPC. When `enabled=true` and current target ≠ `clipboard`, writes it + `killall SystemUIServer` and sets an in-memory `sessionModified` flag. When `enabled=false` and `sessionModified`, runs `defaults delete target` + `killall SystemUIServer` and clears the flag.
- `restoreScreenshotTarget()` — synchronous (`execFileSync`), called from `will-quit`. Runs the delete + killall only if `sessionModified`. Sync because async `will-quit` handlers may be truncated when the event loop tears down.
- Never touches the key if `sessionModified === false` — protects any value the user set themselves before installing ClipStack.

Known limitation: `kill -9` / hard crash bypasses `will-quit` → macOS stays on `target=clipboard`. Recovery: relaunch ClipStack and quit normally (restores on quit), OR toggle setting off in Settings, OR run manually:

```
defaults delete com.apple.screencapture target && killall SystemUIServer
```

The Settings tab includes a recovery hint pointing users to this command.

`globalShortcut.register('Command+Shift+4')` interception was tried and does NOT work: WindowServer consumes the shortcut below Carbon `RegisterEventHotKey`, callback never fires.

### `ipcHandlers.ts` — paste flow

```
ClipboardPasteItem(id):
  writeItemToClipboard(item)            # text | bookmark | file | image
  markClipboardAsCurrent()              # 800ms suppress window
  hideWindow()                          # UI dismiss
  app.once('did-resign-active', paste)  # wait until macOS restores prev target
  setTimeout(paste, 200)                # timeout fallback
  app.hide()                            # trigger the resign
```

Image write path branches on SVG detection (`sniffUti` — first 2KB text scan for `<svg`). SVG becomes clipboard text (source); rasters use `clipboard.write({ image: nativeImage.createFromBuffer(bytes) })` which declares TIFF/PNG via NSPasteboard writeObjects. `writeBuffer("public.svg-image", ...)` was tried and silent-fails on macOS: Electron doesn't call `declareTypes:owner:` first → user pastes empty.

### `updater.ts`

Silent auto-update over GitHub Releases. No `electron-updater` — that library requires a code-signed bundle to verify updates, which we deliberately don't have (§7). Instead, we compare a Unix-ms build timestamp baked into the DMG at build time against a `latest.json` published as a release asset.

- **Build timestamp injection** — [`electron.vite.config.ts`](electron.vite.config.ts) generates a fresh `Date.now()` (Unix-ms) string at production build start and injects it into the main bundle via Vite `define: { __BUILD_TIMESTAMP__: ... }`. Deliberately independent of git — every rebuild, even at the same commit with no source changes, is a distinct "version" so re-releasing is never a no-op for the updater. Dev (`command === "serve"`) hard-codes `"dev"` so the check short-circuits and never nags during development.
- **Boot check** — [`main/index.ts`](src/main/index.ts) fires `void checkForUpdate()` once, no timer, no periodic polling. Fetches `https://github.com/haopx197/electron-clipstack/releases/latest/download/latest.json?t=<ts>` (cache-bust against GitHub's CDN). If `latestTimestamp !== CURRENT_TIMESTAMP`, sets `hasUpdate = true`. All errors swallowed silently — retry next boot.
- **UI** — [`UpdateBanner.tsx`](src/renderer/src/modules/UpdateBanner.tsx) sits below `DragHandle` and below `AccessibilityBanner`. Renders nothing until `status.hasUpdate === true`. During download it overlays a semi-transparent progress fill on its own background instead of a separate progress bar; the fill stays at 100% through the `installing` phase so it doesn't snap back to empty before the app quits. No manual "Check for updates" trigger — boot check is the only path in.
- **Renderer race on first launch** — the banner subscribes to `updates:status-updated` in addition to its one-shot `getUpdateStatus()` call. `checkForUpdate()` pushes the final status when the fetch finishes, so a window that mounted before the fetch completed (slow network, first launch) still gets the "Update available" state the moment it lands.
- **Install flow** — `installUpdate()` downloads the arch-appropriate DMG (`process.arch === "arm64"` → `clipstack-arm64.dmg`, else `clipstack-x64.dmg`) to `userData/updates/ClipStack-update.dmg`, streaming progress via the `updates:install-progress` push channel (throttled to 100ms). Then writes a detached bash script to `/tmp/clipstack-installer-<ts>.sh` and `spawn`s it with `{ detached: true, stdio: "ignore" }` + `unref()`, and calls `app.quit()` after 300ms.
- **The installer script** — hardcoded `PATH=/usr/bin:/bin:/usr/sbin:/sbin` because Electron apps launched from Finder inherit minimal PATH and would fail to find `hdiutil`, `xattr`, etc. Waits up to 30s (`kill -0 <pid>` loop) for the app to exit, then mirrors `install.sh`: `hdiutil attach` → `rm -rf /Applications/ClipStack.app` → `cp -R` → `xattr -cr` → `hdiutil detach` → `open /Applications/ClipStack.app`. Absolute path (not `open -a ClipStack`) so Launch Services can't route to a stale bundle if the user has multiple copies. Log at `userData/updates/installer.log`.
- **`app.isPackaged` gate** — `installUpdate()` no-ops in dev; nothing to swap in.
- **`latest.json` shape** — `{ "timestamp": "1786935663981" }`. Auto-generated at the end of `npm run build:mac` by [`scripts/gen-latest-json.sh`](scripts/gen-latest-json.sh), which reads the timestamp back out of `out/main/index.js` (specifically the `CURRENT_TIMESTAMP = "..."` literal Vite substituted) so it can never drift from the DMG. Release notes for GitHub are typed into the release form itself; the in-app banner shows a static "A newer version of ClipStack is ready." — no per-release copy.

Persistent state across updates: user data lives in `userData` (clip history JSON + `clip-images/`), which is untouched by the installer script — only `/Applications/ClipStack.app` is replaced. Accessibility permission usually needs to be re-granted since each unsigned build has a different ad-hoc signature (§8).

## 6. Renderer

- **`App`** — `AppShell` with `DragHandle` (top drag strip), then optional `UpdateBanner`, then `AccessibilityBanner`, then `TabView`. Banners only render when their condition is true (has update / missing AX).
- **`DragHandle`** — 22px strip with `-webkit-app-region: drag`. Lets the user reposition the frameless window. Interactive children elsewhere are outside the drag region so their clicks route normally.
- **`TabView`** — three tabs: `Clipboard` (default), `Icons` (placeholder), `Settings`. Esc key closes settings if open, otherwise hides the window.
- **`ClipboardTab`** — header (count / cap / `Clear All` when there are unpinned items), then list.
- **`ClipboardItemRow`** — icon + body + hover actions (pin/unpin, delete). Body varies by type: text (3-line clamp), image (`clip-image://local/...` custom scheme, max 120px), bookmark (title + URL), file (basename + full path). Clicking anywhere except the action buttons triggers paste.
- **`SettingsTab`** — hotkey input (records `keydown`, builds accelerator, displays with ⌘⇧⌃⌥ symbols), max-clips input (clamped `[1, 200]`, commits on blur / Enter).
- **`AccessibilityBanner`** — shows when the Swift helper reports it isn't trusted. **Do NOT check `systemPreferences.isTrustedAccessibilityClient` in the Electron main process** — that's a *different* TCC identity (`com.clipstack.app`) than the helper (`com.clipstack.helper`, packaged as a nested `ClipStackHelper.app` bundle). Since the helper is the process that actually posts `CGEvent` Cmd+V and hosts the global mouse monitor, its trust is the only one that matters. The `.app` bundle Info.plist deliberately omits `NSAccessibilityUsageDescription` so macOS doesn't pre-populate `com.clipstack.app` in the Accessibility list — only the helper appears. Query is via a new `ax-status` command on the helper stdin/stdout protocol; response goes through a FIFO of resolvers with a 1s timeout. Event-driven, no polling: main subscribes to the macOS `com.apple.accessibility.api` distributed notification and forwards a ping via `system:accessibility-changed`. When the ping arrives, the renderer unconditionally calls `window.clipstack.relaunch()` — grant AND revoke both need a fresh process because `AXIsProcessTrusted()` caches per-process. Cost: exactly one spurious relaunch on the first-ever launch after install (the helper's AX prime adds it to TCC and fires a notification); every subsequent boot the helper is already in TCC so no notification is emitted from the prime. In dev, `relaunch` is a no-op (electron-vite spawn is incompatible with `app.relaunch()`).

`window.clipstack` is the surface exposed by [`preload/index.ts`](src/preload/index.ts) via `contextBridge`. Renderer talks to main only through those methods and the `onItemsUpdated` push event.

## 7. Build & distribution

```bash
yarn                    # postinstall: fix-electron.sh + electron-builder install-app-deps
yarn dev                # electron-vite dev
yarn build:mac          # → dist/clipstack-1.0.0-arm64.dmg + -x64.dmg
```

- No signing, no notarization. `build:mac*` scripts run with `CSC_IDENTITY_AUTO_DISCOVERY=false` (or via install docs).
- End-user install: `curl -fsSL https://.../install.sh | bash` — mounts DMG, copies to `/Applications`, runs `xattr -cr`.

### Releasing (manual)

Each release must upload four assets so both the first-time installer and the in-app updater keep working:

| Asset                    | Consumed by                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `clipstack-arm64.dmg`    | `install.sh` (Apple Silicon), in-app updater on arm64              |
| `clipstack-x64.dmg`      | `install.sh` (Intel), in-app updater on x64                        |
| `install.sh`             | README `curl … | bash` one-liner (first install)                   |
| `latest.json`            | in-app updater — `{ "timestamp": "<unix-ms>" }`                    |

All four are pulled from `https://github.com/haopx197/electron-clipstack/releases/latest/download/<name>`. GitHub 404s that URL when the *latest* release is missing an asset — even if an earlier release had it — so every release must include all four.

The `timestamp` field in `latest.json` must equal the `__BUILD_TIMESTAMP__` baked into the DMG; if they diverge, the updater compares stale values and either shows a phantom update or misses a real one. `npm run build:mac` runs [`scripts/gen-latest-json.sh`](scripts/gen-latest-json.sh) at the end, which reads the timestamp back out of `out/main/index.js`. Guaranteed match — no manual editing.

Workflow:

```bash
npm run build:mac
```

Then open <https://github.com/haopx197/electron-clipstack/releases>, draft a new release with any unique tag (e.g. a date), drag in the two DMGs from `dist/`, `dist/latest.json`, and `scripts/install.sh`, tick **Set as the latest release**, and publish.

No git commit required — every `build:mac` invocation gets a fresh build identifier from `Date.now()`, so re-releasing without source changes is still a distinct "version" from the app's point of view. Committing before you build is still good practice for git provenance, but not a correctness requirement.

After publish, users running an older build see the "Update available" banner (below `DragHandle`, below `AccessibilityBanner`) the next time they open the app.

### System requirements (users)

| Item              | Minimum                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| OS                | macOS 11 Big Sur (Electron 39 drops 10.15 Catalina)                      |
| CPU               | Apple Silicon (M1+) or Intel x64                                         |
| RAM               | 4 GB+ (~150-200 MB idle for Electron)                                    |
| Disk              | ~200 MB app + variable per image clip (1-3 MB per screenshot)            |
| Permissions       | Accessibility (needed for auto Cmd+V paste and outside-click detection)  |

### Two DMGs vs universal

`electron-builder.yml` produces two separate DMGs (`arm64` + `x64`), smaller per-file. Alternative single universal DMG (~2× the size):

```yaml
mac:
    target:
        - target: dmg
          arch: universal
```

Prerequisite: helper must be a **universal binary** — verify with `file resources/ClipStackHelper.app/Contents/MacOS/ClipStackHelper` (should read `Mach-O universal binary with 2 architectures`). `build:mac` calls `build:helper:universal` which does that.

## Runtime paths

Clip images:
```
~/Library/Application Support/clipstack/clip-images/<uuid>.<ext>
```

Extension rules:
- Copying a file from Finder → original extension preserved: `png / jpg / gif / bmp / webp / svg / ico / avif`. `tiff` / `heic` are converted to PNG (Chromium `<img>` can't render them).
- Copying image data (screenshot, Preview, Photoshop, Figma, browser "Copy Image") → always `.png`. Pasteboard has raw pixels only; the Swift helper decodes via NSImage → PNG.

electron-store settings JSON:
```
~/Library/Application Support/clipstack/clipstack.json
```

Open the images folder quickly:
```
open "$HOME/Library/Application Support/clipstack/clip-images"
```

## 8. Non-obvious gotchas

- **`ELECTRON_RUN_AS_NODE=1` env leak** — electron-vite's bytecode compiler sets this in the shell it spawns; if it leaks into your terminal the built app silently exits on launch (`electron.app` becomes undefined because Electron ran as pure Node). Open a fresh terminal or `unset ELECTRON_RUN_AS_NODE`.
- **`extract-zip` npm hang** — `node_modules/electron/dist/` sometimes contains only `LICENSES.chromium.html` after `yarn install` on some Node versions. `scripts/fix-electron.sh` re-extracts from `~/Library/Caches/electron/<hash>/electron-v<ver>-darwin-<arch>.zip` via `ditto`; wired into `postinstall`.
- **Do not `codesign --deep --force --sign - ClipStack.app`** — corrupts the bundle so it fails with `task_name_for_pid: (os/kern) failure (5)` on launch. Leave the app unsigned; install.sh handles quarantine.
- **Accessibility permission on unsigned rebuilds** — each `yarn build:mac` produces a new ad-hoc linker signature, so macOS treats it as a "different" app and doesn't remember Accessibility grants across rebuilds. The banner auto-relaunches after grant so end-users see this exactly once per install. Developers pay the tax on every rebuild.
- **`app.relaunch()` in dev** — spawns Electron with the raw binary path and bypasses electron-vite's dev server → renderer loads blank. `SystemRelaunch` handler gates on `app.isPackaged`; in dev it just logs.
- **macOS 14+ Cooperative Activation** — pasting immediately after `app.hide()` lands `⌘V` inside ClipStack because the target isn't yet frontmost. The `did-resign-active` wait + helper's `isActive` poll fix this.
- **Chrome/Facebook multi-phase copies** — `changeCount` bumps twice within ~200ms (first text-only, then image). Helper's `waitForPasteboardReady` coalesces them so we don't add a text item then a duplicate image item.
- **`kill -9` / hard crash bypasses screenshot restore** — `will-quit` doesn't fire on SIGKILL / kernel panic, so `com.apple.screencapture target=clipboard` stays set. User symptom: `⌘⇧4` still copies to clipboard but no bottom-right thumbnail after ClipStack is closed. Recovery paths documented inline in `SettingsTab.tsx` recovery hint. Not fixable at code level — SIGKILL cannot be trapped.

## 9. Electron API — versioning

Version pinned: `electron ^39.2.6` (see `package.json`).

Reference docs:
- <https://www.electronjs.org/docs/latest/api/app>
- <https://www.electronjs.org/docs/latest/api/browser-window>
- <https://www.electronjs.org/docs/latest/api/tray>
- <https://www.electronjs.org/docs/latest/api/clipboard>
- <https://www.electronjs.org/docs/latest/api/native-image>
- <https://www.electronjs.org/docs/latest/api/system-preferences>

**Caution**: `/docs/latest/` tracks main branch and may list APIs not yet in the shipped v39. Before using any new API, verify against the local `node_modules/electron/electron.d.ts` or run typecheck.

APIs known **not** to exist in Electron 39 (docs latest shows them):
- `app.isActive()` — track state via `did-become-active` / `did-resign-active` events or `BrowserWindow.getFocusedWindow() !== null`.

When adding or changing an Electron API, verify it exists in v39 — don't code from memory.

## 10. Out of scope for MVP (later)

- `Icons` tab content (placeholder for now).
- Full-text search.
- iCloud / multi-device sync.
- Mac App Store distribution (requires sandbox + entitlements — very different from current setup).
- Signed + notarized DMG (needs Apple Developer $99/year).
