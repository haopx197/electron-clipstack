import { app, protocol, net, session, shell } from "electron";
import { pathToFileURL } from "url";
import { electronApp } from "@electron-toolkit/utils";
import { createMainWindow, showWindow } from "./windowManager";
import { createTray } from "./tray";
import { registerHotkey, unregisterAllHotkeys } from "./hotkey";
import { ensureScreenshotTargetIsClipboard } from "./screencapture";
import { registerIpcHandlers, broadcastItemsUpdated } from "./ipcHandlers";
import { startClipboardWatcher, stopClipboardWatcher } from "./clipboardWatcher";
import { startHelper } from "./helper";
import { ensureAccessibilityPermission } from "./accessibility";

// Register privileged custom scheme for local clipboard image thumbnails.
// Must be called BEFORE app.whenReady().
protocol.registerSchemesAsPrivileged([
    {
        scheme: "clip-image",
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            stream: true
        }
    }
]);

// Single-instance lock: nếu đã có instance chạy, bảo instance cũ show window
// rồi thoát instance mới. Không để user bối rối kiểu "yarn dev xong tự tắt".
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    console.log("[clipstack] another instance is already running, exiting.");
    app.exit(0);
}

app.on("second-instance", () => {
    showWindow();
});

app.whenReady().then(() => {
    electronApp.setAppUserModelId("com.clipstack");

    // Menubar-only app đúng chuẩn: LSUIElement=true → không dock, không menu bar,
    // semantics activation nhẹ hơn regular app. Ưu tiên hơn `app.dock.hide()` đơn
    // thuần vì affect toàn bộ activation policy (Cmd+Tab không show, click window
    // không steal full focus như regular app).
    app.setActivationPolicy("accessory");

    // Gate: không có Accessibility → dialog → quit. Không setup tray/window.
    if (!ensureAccessibilityPermission()) return;

    // Serve clip-image://local/<absolute-path> from disk (safely).
    protocol.handle("clip-image", async (request) => {
        try {
            const url = new URL(request.url);
            const filePath = decodeURIComponent(url.pathname);
            return net.fetch(pathToFileURL(filePath).toString());
        } catch {
            return new Response("Not found", { status: 404 });
        }
    });

    // Block navigation and new-window creation from the renderer.
    app.on("web-contents-created", (_e, contents) => {
        contents.on("will-navigate", (event) => event.preventDefault());
        contents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith("https://") || url.startsWith("http://")) {
                shell.openExternal(url);
            }
            return { action: "deny" };
        });
        contents.on("will-attach-webview", (event) => event.preventDefault());
    });

    // Deny sensitive permission requests by default.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    startHelper();
    createMainWindow();
    createTray();
    registerIpcHandlers();

    const hotkeyResult = registerHotkey();
    if (!hotkeyResult.ok) {
        console.warn("[clipstack] failed to register hotkey:", hotkeyResult.error);
    }

    ensureScreenshotTargetIsClipboard();

    startClipboardWatcher(() => {
        broadcastItemsUpdated();
    });
});

app.on("will-quit", () => {
    stopClipboardWatcher();
    unregisterAllHotkeys();
});

// Menubar-only app: never quit when the window is hidden.
app.on("window-all-closed", () => {
    // no-op — we only hide the window; the app stays alive.
});
