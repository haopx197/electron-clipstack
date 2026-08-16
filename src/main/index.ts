import { app, protocol, net, session, shell } from "electron";
import { pathToFileURL } from "url";
import { electronApp } from "@electron-toolkit/utils";
import { createMainWindow, showWindow } from "./windowManager";
import { createTray } from "./tray";
import { registerHotkey, unregisterAllHotkeys } from "./hotkey";
import { applyCaptureToClipboard, restoreScreenshotTarget } from "./screencapture";
import { registerIpcHandlers, broadcastItemsUpdated } from "./ipcHandlers";
import { startClipboardWatcher, stopClipboardWatcher } from "./clipboardWatcher";
import { startHelper } from "./helper";
import { getCaptureToClipboard } from "./store";
import { checkForUpdate } from "./updater";

// Custom scheme for clipboard image thumbnails. MUST run BEFORE app.whenReady().
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

// Single-instance lock: existing instance shows window, new instance exits.
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

    // Menubar-only: LSUIElement equivalent — no dock, no Cmd+Tab, no
    // focus stealing like a regular app. Preferred over just `app.dock.hide()`.
    app.setActivationPolicy("accessory");

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

    // Block navigation and new-window from renderer.
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

    // Deny all permission requests by default.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    startHelper();
    createMainWindow();
    createTray();
    registerIpcHandlers();

    const hotkeyResult = registerHotkey();
    if (!hotkeyResult.ok) {
        console.warn("[clipstack] failed to register hotkey:", hotkeyResult.error);
    }

    void applyCaptureToClipboard(getCaptureToClipboard());

    startClipboardWatcher(() => {
        broadcastItemsUpdated();
    });

    // Boot-time update check. Fire-and-forget: no timer, no periodic polling —
    // subsequent checks are user-initiated from the Settings tab.
    void checkForUpdate();
});

app.on("will-quit", () => {
    stopClipboardWatcher();
    unregisterAllHotkeys();
    restoreScreenshotTarget();
});

// Menubar-only: don't quit when window hidden.
app.on("window-all-closed", () => {
    // no-op — window hides, app keeps running.
});
