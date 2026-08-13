# ClipStack — Plan

Clipboard history manager cho macOS, lấy cảm hứng từ Windows 11 Clipboard History (`Win+V`), build bằng Electron + TypeScript + React.

## 1. Tech stack

| Layer            | Chọn                                    | Lý do                                                        |
| ---------------- | --------------------------------------- | ------------------------------------------------------------ |
| Shell            | Electron                                | theo yêu cầu                                                 |
| Ngôn ngữ         | TypeScript                              | an toàn type, dễ maintain                                    |
| Bundler/scaffold | `electron-vite`                         | chuẩn hiện tại cho main/preload/renderer, HMR nhanh          |
| UI               | React                                   | quen thuộc, đủ nhẹ cho 1 popover nhỏ                         |
| Storage          | `electron-store` (JSON)                 | dữ liệu nhỏ (≤200 item), không cần search → không cần SQLite |
| Đóng gói         | `electron-builder` → target `dmg`       | không lên App Store, không cần sign/notarize                 |
| Paste tự động    | `osascript` (AppleScript System Events) | dùng chung với việc query vị trí caret focused element       |

## 2. Cấu trúc project

```
clipstack/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── native/
│   └── ClipStackHelper.swift      # Swift child process: AX focus query + global mouse monitor
├── resources/
│   ├── trayIconTemplate.png       # icon tray 16x16 (do bạn cung cấp)
│   ├── trayIconTemplate@2x.png    # 32x32 cho Retina
│   └── ClipStackHelper            # binary compile từ native/ClipStackHelper.swift (build:helper)
├── src/
│   ├── shared/
│   │   ├── types.ts                # ClipboardItem, AppSettings, constants
│   │   └── ipc.ts                  # tên channel IPC dùng chung main/preload
│   ├── main/
│   │   ├── index.ts                # entry: app lifecycle, wiring mọi module
│   │   ├── store.ts                # đọc/ghi electron-store (items + settings)
│   │   ├── images.ts               # lưu/xoá file ảnh trong userData/clip-images
│   │   ├── clipboardWatcher.ts      # poll clipboard, phát hiện thay đổi
│   │   ├── paste.ts                 # simulate Cmd+V qua osascript
│   │   ├── helper.ts                # spawn+IPC với ClipStackHelper (AX query + mouse hook)
│   │   ├── windowManager.ts         # tạo/show/hide/resize window
│   │   ├── tray.ts                  # tray icon + click handler
│   │   ├── hotkey.ts                # đăng ký/đổi global shortcut
│   │   └── ipcHandlers.ts           # nối IPC channel → các hàm store/window/paste
│   ├── preload/
│   │   ├── index.ts                 # contextBridge, expose window.clipstack
│   │   └── index.d.ts               # type cho window.clipstack ở renderer
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── styles.css
│           ├── types.ts
│           └── components/
│               ├── TopBar.tsx        # nút reset size + nút settings
│               ├── Tabs.tsx          # tab Clipboard / Icons
│               ├── ClipboardTab.tsx  # Clear All + list
│               ├── ClipboardItemRow.tsx
│               ├── IconsTab.tsx      # placeholder, để trống
│               └── SettingsPanel.tsx # đổi hotkey
```

## 3. Data model (`src/shared/types.ts`)

```ts
type ClipboardItem = {
    id: string;
    type: "text" | "image";
    content: string; // text: nội dung thô; image: path file PNG trong userData/clip-images
    pinned: boolean;
    createdAt: number; // dùng để sort trong nhóm unpinned
};

type AppSettings = {
    hotkey: string; // accelerator string, mặc định 'Command+Shift+V'
};

const DEFAULT_HOTKEY = "Command+Shift+V";
const DEFAULT_WINDOW_SIZE = { width: 400, height: 500 };
const MAX_UNPINNED_ITEMS = 200;
```

**Quy tắc thứ tự hiển thị** (áp dụng ở mọi nơi trả list ra renderer):
`[...pinned items] + [...unpinned items, mới nhất trước]`
→ item vừa copy luôn nằm ngay dưới nhóm pinned, không chen giữa các item đã ghim.

## 4. IPC contract (`src/shared/ipc.ts`)

| Channel                   | Hướng                        | Payload → Trả về                                                             |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `clipboard:get-items`     | renderer → main (invoke)     | `()` → `ClipboardItem[]` (đã group pinned trước)                             |
| `clipboard:paste-item`    | renderer → main (invoke)     | `(id)` → ghi clipboard + ẩn window + simulate paste                          |
| `clipboard:pin-item`      | renderer → main (invoke)     | `(id)` → toggle pinned → `ClipboardItem[]` mới                               |
| `clipboard:delete-item`   | renderer → main (invoke)     | `(id)` → xoá item (+ file ảnh nếu có) → `ClipboardItem[]` mới                |
| `clipboard:clear-all`     | renderer → main (invoke)     | `()` → chỉ xoá item chưa ghim (+ file ảnh liên quan) → `ClipboardItem[]` mới |
| `clipboard:items-updated` | main → renderer (push event) | bắn mỗi khi watcher phát hiện item mới                                       |
| `settings:get-hotkey`     | renderer → main (invoke)     | `()` → `string`                                                              |
| `settings:set-hotkey`     | renderer → main (invoke)     | `(accelerator)` → `{ ok: boolean; error?: string }`                          |
| `window:reset-size`       | renderer → main (invoke)     | `()` → resize về 400×500, giữ nguyên góc trên-trái                           |
| `window:hide`             | renderer → main (invoke)     | `()` → ẩn window (dùng khi nhấn `Esc`)                                       |

## 5. Main process — hành vi từng module

**`clipboardWatcher.ts`**

- macOS không có notification "clipboard changed" ở tầng OS; mọi clipboard manager (kể cả native) đều dựa vào `NSPasteboard.changeCount`. ClipStack watch bằng cách:
    - **Primary**: helper Swift poll `NSPasteboard.general.changeCount` 100ms trong DispatchSource background queue, chỉ notify Node khi count đổi → 0 CPU + 0 log noise lúc idle.
    - **Fallback**: nếu helper unavailable (chưa spawn / crash / chưa cấp Accessibility), rơi về JS `setInterval(poll, 400ms)`.
- Khi có tín hiệu "clipboard đã đổi", `captureCurrent()` chạy dò format qua `clipboard.has(<UTI>)` trước khi call reader (không call `readHTML`/`readRTF` khi không cần → tránh CoreText font resolution + macOS log spam).
- Text: so sánh string trực tiếp (rẻ).
- Ảnh: so sánh bằng **hash** (`crypto.createHash('sha1')` trên buffer PNG từ `image.toPNG()`), **không** dùng `image.toDataURL()` để so sánh (base64 hoá tốn CPU nếu ảnh to và nằm lâu trên clipboard).
- Copy trùng nội dung đã có trong list → chỉ bump timestamp + đưa lên đầu nhóm unpinned, không tạo item trùng.
- Trước khi app tự ghi clipboard (lúc paste), phải "seed" lại giá trị `lastSignature` để watcher không hiểu nhầm đó là một copy mới của user.

**`store.ts`**

- `addItem`, `pinItem`, `deleteItem`, `clearAll`, `getItems` (luôn trả về theo thứ tự pinned-first).
- `MAX_UNPINNED_ITEMS = 200`: khi thêm item mới vượt cap, các item unpinned cũ nhất bị đẩy ra phải được xoá — **và nếu item bị đẩy ra là ảnh, phải gọi `images.deleteImageFile()` xoá file PNG tương ứng** (tránh rác tích tụ trong `clip-images/`).
- `deleteItem` / `clearAll`: cùng nguyên tắc — xoá item ảnh phải xoá kèm file.
- `clearAll`: chỉ xoá item **chưa ghim**, giữ nguyên toàn bộ pinned.

**`images.ts`**

- `saveImage(nativeImage)`: ghi PNG vào `app.getPath('userData')/clip-images/<uuid>.png`, trả về path.
- `deleteImageFile(path)`: xoá file, bọc try/catch (best-effort).

**`paste.ts`**

- `execFile('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'])`.
- Cần quyền **Accessibility** — macOS tự hiện dialog xin quyền lần đầu gọi. Nếu user chưa cấp quyền: item vẫn nằm trong clipboard hệ thống, user tự bấm `Cmd+V` được — không mất dữ liệu, chỉ mất tự động hoá.

**`windowManager.ts`**

- 1 `BrowserWindow` duy nhất dùng chung cho cả "popover nhanh" và "manager" — không tách 2 window riêng.
- `frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`. **KHÔNG** dùng `type: 'panel'` — Electron 39 có bug với `frame: false` + panel: NSWindow class không support `NSWindowStyleMaskNonactivatingPanel` → warning `NSWindow does not support nonactivating panel styleMask 0x80` và behavior non-activating không thật sự hoạt động.
- Show bằng `showInactive()` (không phải `show()` + `focus()`): order-front mà không become key window → app user đang gõ vẫn giữ focus/caret khi window mở lên.
- Khi user click vào item để paste, Electron sẽ activate app ClipStack. Để trả focus về app cũ, [ipcHandlers.ts](src/main/ipcHandlers.ts) gọi `app.hide()` sau khi ghi clipboard — macOS sẽ deactivate ClipStack, app frontmost trước đó quay lại làm key, rồi `simulatePaste()` (Cmd+V) chạy đúng đích sau 80ms.
- `resetWindowSize()`: set lại 400×500, giữ nguyên toạ độ góc trên-trái hiện tại.
- **KHÔNG** đăng ký blur handler cho window. Blur trên macOS fire không deterministic (menubar activation từ tray click, showInactive edge cases…) gây race với tray.click: blur hide TRƯỚC tray.click → tray.click thấy `visible=false` → show lại → user cảm giác tray không đóng được. Đóng window qua: mouse-monitor (click ngoài), tray toggle, hotkey toggle, item click (paste + hide qua IPC), Esc. Trade-off: Cmd+Tab switch app không tự đóng — chấp nhận được, user click ngoài hoặc Esc.
- `hide` event: gọi `stopMouseMonitor()` để tắt global mouse hook.
- Mỗi lần show: gọi `queryFocusIsTextInput()` để cập nhật `canPaste` + `startMouseMonitor(onGlobalClick)` để bắt click outside → hide.

**`helper.ts`** + **`native/ClipStackHelper.swift`**

- Persistent Swift child process, spawn 1 lần lúc app khởi động, giao tiếp line-based qua stdin/stdout.
- 2 chức năng dùng chung 1 quyền Accessibility (đã cấp cho paste):
    - **AX focus query**: hỏi `AXFocusedUIElement` của app frontmost hiện tại là text-input hay không (role ∈ `AXTextField/AXTextArea/AXSearchField/AXComboBox/AXWebArea`, hoặc `kAXValueAttribute` settable). Trả `focus:1` hoặc `focus:0`. Chi phí per-query: ~5-10ms (không phải 240ms như osascript vì tránh spawn process mới).
    - **Global mouse monitor**: `NSEvent.addGlobalMonitorForEvents` với mask `[.leftMouseDown, .rightMouseDown, .otherMouseDown]`. Mỗi click bắn `click:<x>,<y>` (toạ độ NSEvent origin bottom-left; Node convert sang top-left dựa vào chiều cao primary screen).
- Build: `npm run build:helper` (swiftc `-O`). Được auto-run trong `dev`, `build`, `build:mac`.
- Bundle: `resources/ClipStackHelper` được electron-builder pack vào `asarUnpack` (đã có sẵn `resources/**`).
- Nếu binary chưa tồn tại lúc app khởi động → helper không spawn → `canPaste` mặc định `false` (paste bị disable) và click outside không auto-close (chỉ đóng qua blur hoặc hotkey re-press).

### Behavior spec (show/hide)

1. **Mở window**: bấm hotkey (mặc định `Cmd+Shift+V`) hoặc click tray icon.
    - **Position — LOCKED**: window **LUÔN LUÔN** hiện ngay dưới tray icon (`tray.getBounds()`), bất kể mở bằng hotkey hay tray click. Đây là spec cố định — **KHÔNG được đổi sang cursor position hoặc bất kỳ anchor nào khác** trừ khi user yêu cầu trực tiếp thay đổi requirement này.
    - Dùng `showInactive` → app user đang gõ **giữ nguyên focus/caret**.
2. **Có thể paste hay không** phụ thuộc vào `queryFocusIsTextInput()` chạy ngay lúc show:
    - Có text-input focus: renderer nhận `canPaste=true` → item click enabled → paste vào đúng text field đó.
    - Không có: renderer nhận `canPaste=false` → item click disabled (opacity mờ + cursor not-allowed + title tooltip). Item click là no-op.
3. **Đóng window** — 4 cách (tất cả explicit, không dùng blur):
    - Click 1 item → paste + hide.
    - Click ra ngoài window (bất kỳ đâu, kể cả app khác/Desktop) → `ClipStackHelper` bắn `click:<x>,<y>` → main check bounds (trong window/trong tray → skip; ngoài → hide).
    - Bấm lại hotkey hoặc click tray → toggle → hide.
    - Bấm `Esc` khi window có key → hide qua IPC.
4. **KHÔNG dùng blur handler** — root cause của bug tray toggle. macOS fire blur không deterministic, hide bằng blur race với tray.click. Trade-off Cmd+Tab: chấp nhận không tự đóng.
5. **State visible track explicit** (biến `visible` module-level trong windowManager), sync với event `show`/`hide`. **KHÔNG** dùng `mainWindow.isVisible()` cho logic toggle — Electron trả state chưa đồng bộ ngay sau `showInactive()`/`hide()`.

**`tray.ts`**

- Đọc icon từ `resources/trayIconTemplate.png` (+ `@2x.png` cho Retina) — **do user cung cấp**, không dùng emoji placeholder.
- Click → `toggleWindow(true)` (fromTray flag để windowManager biết cần guard blur race).

**`hotkey.ts`**

- `registerHotkey()` lúc khởi động app (đọc từ settings).
- `changeHotkey(accelerator)`: unregister cũ, thử register mới; nếu fail (trùng app khác / string sai) → rollback về hotkey cũ, trả `{ ok: false, error }`.

## 6. Renderer — hành vi từng component

- **`TopBar`**: icon trái = gọi `window:reset-size`; icon phải = toggle hiển thị `SettingsPanel` (thay cho Tabs+ClipboardTab khi đang mở).
- **`Tabs`**: 2 tab `Clipboard` (mặc định) / `Icons` (rỗng, để làm sau).
- **`ClipboardTab`**: header đếm số item + nút `Clear All` (disable nếu list rỗng); list item bên dưới.
- **`ClipboardItemRow`**: click vào nội dung → `paste-item`; hover hiện 2 icon nhỏ (pin/xoá) chặn `stopPropagation` để không trigger paste; ảnh hiện thumbnail (`<img src="file://...">`), text hiện tối đa 3 dòng rồi truncate.
- **`SettingsPanel`**: click vào ô hotkey → bắt `onKeyDown`, build accelerator string từ modifier keys (`Command`/`Control`/`Alt`/`Shift`) + phím chính; nút Lưu gọi `settings:set-hotkey`, hiện lỗi nếu `ok: false`.
- App-level: `Esc` → nếu đang mở Settings thì đóng Settings, ngược lại ẩn cả window.

## 7. Build & phân phối

```bash
npm install
npm run dev          # electron-vite dev, test trực tiếp trên máy
npm run build:mac    # typecheck + build + electron-builder → file .dmg trong dist/
```

- Không sign/notarize (không cần Apple Developer account $99/năm).
- Vì không sign: lần đầu mở trên máy nào cũng cần `xattr -cr ClipStack.app` hoặc right-click → Open để qua Gatekeeper.
- Quyền Accessibility: System Settings → Privacy & Security → Accessibility → cấp cho ClipStack (macOS tự nhắc lần đầu dùng tính năng paste).

### Yêu cầu hệ thống (chạy được app đã build)

| Mục            | Yêu cầu tối thiểu                                                            |
| -------------- | ---------------------------------------------------------------------------- |
| Hệ điều hành   | **macOS 11 Big Sur** trở lên (Electron 39 drop support 10.15 Catalina)       |
| Kiến trúc CPU  | Apple Silicon (M1/M2/M3/M4) **hoặc** Intel x64                               |
| RAM            | 4 GB+ (Electron runtime ~150-200 MB idle)                                    |
| Disk           | ~200 MB cho app + tuỳ số clip (mỗi ảnh screenshot ~1-3 MB)                   |
| Quyền cần cấp  | Accessibility (bắt buộc để simulate Cmd+V)                                   |

**Máy nào chạy được**:

- MacBook Air / Pro (2018+): OK — mặc định lên được Big Sur.
- MacBook Air / Pro (M1+, 2020+): OK — Apple Silicon.
- iMac (2015+), Mac mini (2018+), Mac Studio, Mac Pro (2019+): OK nếu update macOS 11+.
- **Không chạy được**: máy dưới macOS 10.15 Catalina — mostly Mac từ 2012 và cũ hơn không update lên được Big Sur.

**Không hỗ trợ iOS/iPadOS** — Electron chỉ chạy desktop (macOS/Windows/Linux), không port qua iOS.

### Build cho cả 2 kiến trúc (universal DMG)

Mặc định `electron-builder` build theo arch máy build (chỉ arm64 hoặc chỉ x64 → chỉ máy tương ứng chạy được). Muốn 1 DMG chạy cả Intel + Apple Silicon → thêm vào [electron-builder.yml](electron-builder.yml):

```yaml
mac:
    target:
        - target: dmg
          arch:
              - x64
              - arm64
    # HOẶC 1 file universal duy nhất:
    # target:
    #     - target: dmg
    #       arch: universal
```

Trade-off: `universal` gấp đôi size (~300 MB DMG); riêng lẻ 2 arch xuất ra 2 file nhỏ hơn nhưng user phải chọn đúng.

## 8. Checklist thứ tự implement (đề xuất)

1. Scaffold project (`package.json`, `electron.vite.config.ts`, tsconfig)
2. `shared/types.ts`, `shared/ipc.ts`
3. `main/store.ts` + `main/images.ts` (có cleanup ảnh khi xoá/trim cap)
4. `main/clipboardWatcher.ts` (dùng hash, không dùng toDataURL để so sánh ảnh)
5. `main/windowManager.ts`, `main/tray.ts`, `main/hotkey.ts`
6. `main/paste.ts`, `main/ipcHandlers.ts`, `main/index.ts` (wiring)
7. `preload/index.ts` + `index.d.ts`
8. Renderer: `App.tsx` + toàn bộ component trong mục 6
9. `electron-builder.yml` (mac target `dmg`, category `public.app-category.utilities`)
10. Test trên Mac thật: `npm run dev` → thử copy text/ảnh, pin/xoá, đổi hotkey, paste
11. `npm run build:mac` → test file `.dmg` xuất ra

## Runtime paths (macOS)

**Folder ảnh clipboard**:

```
/Users/brianpgrt/Library/Application Support/clipstack/clip-images
```

Base = `app.getPath("userData")` (xem [images.ts](src/main/images.ts)). Mỗi image: `<uuid>.<ext>`, ext theo format thật (sniff magic bytes tại [clipboardWatcher.ts](src/main/clipboardWatcher.ts) — `sniffImageFormat`).

Rule ext:

- **Copy file ảnh từ Finder** → giữ ext gốc: `png / jpg / gif / bmp / webp / svg / ico / avif`. Riêng `tiff / heic` convert sang `png` (Chromium `<img>` không render).
- **Copy image data (không phải file)** — screenshot, Preview, Photoshop, Figma, browser "Copy Image" — **luôn `.png`**. Vì pasteboard chỉ có raw pixel data, helper Swift decode qua `NSImage` → PNG.

Mở nhanh trong Finder:

```
open "/Users/brianpgrt/Library/Application Support/clipstack/clip-images"
```

Settings JSON (electron-store):

```
/Users/brianpgrt/Library/Application Support/clipstack/clipstack.json
```

## Behavior override macOS

**Screenshot target = clipboard**: [screencapture.ts](src/main/screencapture.ts) chạy lúc `whenReady` → `defaults write com.apple.screencapture target clipboard` + `killall SystemUIServer` (idempotent, skip nếu đã set). Sau đó `Cmd+Shift+3/4/5` bỏ ảnh thẳng vào clipboard → watcher pick up.

Không auto-restore lúc quit (user cài ClipStack chính vì behavior này). Undo:

```
defaults delete com.apple.screencapture target && killall SystemUIServer
```

Đã thử approach `globalShortcut.register('Command+Shift+4')` để intercept — **fail**: macOS WindowServer consume phím ở tầng dưới Carbon `RegisterEventHotKey`, callback không fire. Không quay lại hướng đó.

## 9. Ngoài phạm vi MVP (làm sau)

- Tab "Icons" (nội dung để trống, bạn định nghĩa sau)
- Search
- Sync nhiều máy / iCloud
- Phân phối qua Mac App Store (cần sandbox + entitlements riêng, khác hẳn hướng hiện tại)

## code follow https://www.electronjs.org/ và làm best practice mới nhất

## Electron API — CHUẨN

**Version pinned**: `electron ^39.2.6` (xem `package.json`). Docs tham chiếu:

- [app](https://www.electronjs.org/docs/latest/api/app)
- [browser-window](https://www.electronjs.org/docs/latest/api/browser-window)
- [tray](https://www.electronjs.org/docs/latest/api/tray)
- [clipboard](https://www.electronjs.org/docs/latest/api/clipboard)
- [native-image](https://www.electronjs.org/docs/latest/api/native-image)

**CẢNH BÁO**: docs URL `/docs/latest/` track branch mới nhất, có API xuất hiện trước khi ship trong Electron 39. Trước khi dùng bất kỳ API nào, **verify** nó tồn tại trong v39 shipped bằng:

- Grep trong `node_modules/electron/electron.d.ts`
- Hoặc test compile TS (nếu missing → TS error `Property 'X' does not exist on type 'App'`)

**APIs đã verify KHÔNG tồn tại trong Electron 39** (docs latest có, shipped không):

- `app.isActive()` → thay bằng track state qua event `did-become-active` / `did-resign-active`, hoặc `BrowserWindow.getFocusedWindow() !== null`

Khi thêm/đổi Electron API, follow docs chính thức + verify version. Không code dựa vào memory/guess.
