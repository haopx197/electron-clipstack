import { app, protocol, net, session, shell } from "electron";
import { pathToFileURL } from "url";
import { electronApp } from "@electron-toolkit/utils";
import { IPC } from "../shared/ipc";
import { createMainWindow, getMainWindow, showWindow } from "./windowManager";
import { createTray } from "./tray";
import { registerHotkey, unregisterAllHotkeys } from "./hotkey";
import { applyCaptureToClipboard, restoreScreenshotTarget } from "./screencapture";
import { registerIpcHandlers, broadcastItemsUpdated } from "./ipcHandlers";
import { startClipboardWatcher, stopClipboardWatcher } from "./clipboardWatcher";
import {
    startHelper,
    startMouseMonitor,
    stopMouseMonitor,
    setAccessibilityChangedListener
} from "./helper";
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

    // Menubar-only: no dock, no Cmd+Tab, no focus stealing. `LSUIElement=true`
    // in Info.plist covers this from launch (before whenReady fires);
    // `setActivationPolicy("accessory")` re-asserts at runtime; `dock.hide()`
    // is a belt-and-braces for any transient re-activation (e.g. macOS
    // briefly promoting the process while displaying a modal).
    app.setActivationPolicy("accessory");
    app.dock?.hide();

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

    // Prime the helper's AX registration: `NSEvent.addGlobalMonitorForEvents`
    // records a TCC request even when untrusted (returns nil), which is what
    // makes `ClipStackHelper` appear in System Settings → Privacy →
    // Accessibility. Without this prime, the helper only shows up after the
    // user first opens the window (windowManager calls startMouseMonitor
    // there) — so on a fresh install, clicking "Open Settings" from the
    // banner reveals an empty list and the user has nothing to grant.
    startMouseMonitor(() => {});
    stopMouseMonitor();

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

    // Boot-time update check. Fire-and-forget: no timer, no periodic polling,
    // no manual re-check. On completion the result is pushed to the renderer
    // (`UpdatesStatusUpdated`) in case the window mounted before it finished.
    void checkForUpdate();

    // The helper observes `com.apple.accessibility.api` on
    // NSDistributedNotificationCenter and forwards each event as an
    // `ax-changed` line. We rebroadcast to the renderer so it can trigger a
    // relaunch. Subscription lives in the helper so nothing in the Electron
    // main process touches AX-adjacent APIs — that keeps `com.clipstack.app`
    // out of the System Settings Accessibility list.
    setAccessibilityChangedListener(() => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.SystemAccessibilityChanged);
        }
    });
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
