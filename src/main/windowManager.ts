import { app, BrowserWindow, Rectangle, screen } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { DEFAULT_WINDOW_SIZE } from "../shared/types";
import { startMouseMonitor, stopMouseMonitor } from "./helper";
import { getTray } from "./tray";

let mainWindow: BrowserWindow | null = null;
// Track state via JS variable only. DO NOT use `mainWindow.isVisible()`:
// after showInactive/hide, IPC query `[NSWindow isVisible]` lags a few ms →
// rapid tray clicks see stale state → wrong toggle.
let visible = false;

export function getMainWindow(): BrowserWindow | null {
    return mainWindow;
}

export function createMainWindow(): BrowserWindow {
    mainWindow = new BrowserWindow({
        width: DEFAULT_WINDOW_SIZE.width,
        height: DEFAULT_WINDOW_SIZE.height,
        show: false,
        frame: false,
        // Fixed under tray; user can't drag elsewhere.
        movable: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: true,
        backgroundColor: "#FFFFFF",
        webPreferences: {
            preload: join(__dirname, "../preload/index.js"),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false,
            spellcheck: false,
            // No throttle when hidden → paint ready on show,
            // tray click on/off doesn't wait for renderer wake.
            backgroundThrottling: false
        }
    });

    mainWindow.setAlwaysOnTop(true, "floating");
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // DO NOT register blur/show/hide listeners — blur races with tray.click,
    // dual-writing state via events races. All close paths go through explicit hideWindow().

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
        mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
    }

    return mainWindow;
}

function isPointInRect(x: number, y: number, b: Rectangle): boolean {
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

function onGlobalClick(x: number, y: number): void {
    if (!mainWindow || !visible) return;
    if (isPointInRect(x, y, mainWindow.getBounds())) return;
    // Click inside menubar strip → don't hide; tray.click handles toggle.
    // Use display of click point (multi-monitor safe).
    const display = screen.getDisplayNearestPoint({ x, y });
    if (y < display.workArea.y) return;
    hideWindow();
}

// Always position under tray icon (spec LOCKED — CLAUDE.md).
function positionUnderTray(): void {
    if (!mainWindow) return;
    const tray = getTray();
    if (!tray) return;
    const t = tray.getBounds();
    const [w] = mainWindow.getSize();
    mainWindow.setPosition(Math.round(t.x + t.width / 2 - w / 2), Math.round(t.y + t.height + 4));
}

export function showWindow(): void {
    if (!mainWindow || visible) return;
    visible = true;
    positionUnderTray();
    // Only unhide when app actually hidden — avoids macOS re-activation animation.
    // Needed after paste (app.hide already ran).
    if (app.isHidden()) app.show();
    // showInactive: order-front, don't take key/focus → user's typing keeps caret.
    mainWindow.showInactive();
    startMouseMonitor(onGlobalClick);
}

export function hideWindow(): void {
    if (!mainWindow || !visible) return;
    visible = false;
    stopMouseMonitor();
    mainWindow.hide();
}

export function toggleWindow(): void {
    if (!mainWindow) return;
    if (visible) hideWindow();
    else showWindow();
}
