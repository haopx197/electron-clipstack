import { ipcMain, clipboard, nativeImage, app, systemPreferences, shell } from "electron";
import { readFileSync } from "fs";
import { IPC } from "../shared/ipc";
import {
    getItems,
    pinItem,
    deleteItem,
    clearAll,
    findItem,
    getHotkey,
    getMaxClips,
    setMaxClips,
    getCaptureToClipboard,
    setCaptureToClipboard
} from "./store";
import { markClipboardAsCurrent } from "./clipboardWatcher";
import { simulatePasteViaHelper } from "./helper";
import { changeHotkey } from "./hotkey";
import { getMainWindow, hideWindow } from "./windowManager";
import { applyCaptureToClipboard } from "./screencapture";
import { ClipboardItem } from "../shared/types";

// Detect SVG to split paste flow (SVG doesn't go through nativeImage). Other
// rasters are auto-detected via nativeImage.createFromBuffer.
function sniffUti(bytes: Buffer): "public.svg-image" | null {
    if (bytes.length < 4) return null;
    const head = bytes.subarray(0, 2048).toString("utf8");
    if (/<svg[\s>]/i.test(head)) return "public.svg-image";
    return null;
}

function writeItemToClipboard(item: ClipboardItem): void {
    clipboard.clear();

    switch (item.type) {
        case "text": {
            clipboard.writeText(item.content);
            return;
        }
        case "bookmark": {
            // Electron `clipboard.write()`: `bookmark` = title, URL goes in `text`.
            clipboard.write({
                text: item.content,
                bookmark: item.bookmarkTitle ?? ""
            });
            return;
        }
        case "file": {
            // Path text (for text editors) + file-url UTI (for Finder/File apps).
            clipboard.writeText(item.content);
            try {
                clipboard.writeBuffer(
                    "public.file-url",
                    Buffer.from(`file://${encodeURI(item.content)}`, "utf8")
                );
            } catch {
                // best-effort — ignore
            }
            return;
        }
        case "image": {
            let bytes: Buffer;
            try {
                bytes = readFileSync(item.content);
            } catch {
                return;
            }
            const uti = sniffUti(bytes);

            // SVG: write text (source) only. writeBuffer("public.svg-image")
            // silent-fails because Electron doesn't call `declareTypes:owner:`
            // before setData → user pastes empty.
            if (uti === "public.svg-image") {
                clipboard.writeText(bytes.toString("utf8"));
                return;
            }

            // Raster: `clipboard.write({image})` uses NSPasteboard writeObjects —
            // auto-declares TIFF/PNG. Standard image consumers work fine.
            const image = nativeImage.createFromBuffer(bytes);
            if (!image.isEmpty()) {
                clipboard.write({ image });
            }
            return;
        }
    }
}

export function registerIpcHandlers(): void {
    ipcMain.handle(IPC.ClipboardGetItems, () => getItems());

    ipcMain.handle(IPC.ClipboardPasteItem, async (_e, id: string) => {
        const item = findItem(id);
        if (!item) return;

        writeItemToClipboard(item);
        markClipboardAsCurrent();
        hideWindow();
        // Wait for app resign-active (macOS restored frontmost target) before paste.
        // macOS 14+ Cooperative Activation blocks helper's `target.activate()`
        // if we paste immediately → Cmd+V lands in ClipStack. Old "paste only
        // works first time" bug had same cause: on 2nd try helper's 300ms poll
        // didn't catch target active in time. 200ms fallback to avoid hang.
        let done = false;
        const onResign = (): void => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            simulatePasteViaHelper();
        };
        app.once("did-resign-active", onResign);
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            app.removeListener("did-resign-active", onResign);
            simulatePasteViaHelper();
        }, 200);
        app.hide();
    });

    ipcMain.handle(IPC.ClipboardPinItem, (_e, id: string) => pinItem(id));
    ipcMain.handle(IPC.ClipboardDeleteItem, (_e, id: string) => deleteItem(id));
    ipcMain.handle(IPC.ClipboardClearAll, () => clearAll());

    ipcMain.handle(IPC.SettingsGetHotkey, () => getHotkey());
    ipcMain.handle(IPC.SettingsSetHotkey, (_e, accelerator: string) => changeHotkey(accelerator));

    // `false` = check-only, don't trigger native prompt.
    ipcMain.handle(IPC.SystemAccessibilityStatus, () =>
        systemPreferences.isTrustedAccessibilityClient(false)
    );
    ipcMain.handle(IPC.SystemOpenAccessibilitySettings, () =>
        shell.openExternal(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        )
    );
    ipcMain.handle(IPC.SystemRelaunch, () => {
        // Dev mode: app.relaunch() bypasses vite dev server → blank renderer.
        // Skip auto-relaunch; restart manually in dev.
        if (!app.isPackaged) {
            console.log("[clipstack] skip auto-relaunch in dev mode; restart manually");
            return;
        }
        app.relaunch();
        app.exit(0);
    });

    ipcMain.handle(IPC.SettingsGetMaxClips, () => getMaxClips());
    ipcMain.handle(IPC.SettingsSetMaxClips, (_e, n: number) => {
        const items = setMaxClips(n);
        broadcastItemsUpdated();
        return { maxClips: getMaxClips(), items };
    });

    ipcMain.handle(IPC.SettingsGetCaptureToClipboard, () => getCaptureToClipboard());
    ipcMain.handle(IPC.SettingsSetCaptureToClipboard, async (_e, value: boolean) => {
        await applyCaptureToClipboard(value);
        setCaptureToClipboard(value);
        return value;
    });

    ipcMain.handle(IPC.WindowHide, () => hideWindow());
}

export function broadcastItemsUpdated(): void {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.ClipboardItemsUpdated, getItems());
    }
}
