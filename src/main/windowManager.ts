import { app, BrowserWindow, Rectangle, screen } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { DEFAULT_WINDOW_SIZE } from "../shared/types";
import { startMouseMonitor, stopMouseMonitor } from "./helper";

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
        // Movable via renderer drag handle (`-webkit-app-region: drag`).
        // Position resets to cursor on every show().
        movable: true,
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

// Position window bottom-right of current cursor. Clamps to the display's
// work area so the window never spawns off-screen. Small 4px gap so the
// cursor isn't sitting inside the window on show.
const CURSOR_GAP = 4;

function positionNearCursor(): void {
    if (!mainWindow) return;
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const [w, h] = mainWindow.getSize();

    let x = cursor.x + CURSOR_GAP;
    let y = cursor.y + CURSOR_GAP;

    const wa = display.workArea;
    // Right/bottom overflow → flip to left/top of cursor so window stays visible.
    if (x + w > wa.x + wa.width) x = cursor.x - w - CURSOR_GAP;
    if (y + h > wa.y + wa.height) y = cursor.y - h - CURSOR_GAP;
    // Final clamp in case flipping also overshoots (tiny displays).
    x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
    y = Math.max(wa.y, Math.min(y, wa.y + wa.height - h));

    mainWindow.setPosition(Math.round(x), Math.round(y));
}

export function showWindow(): void {
    if (!mainWindow || visible) return;
    visible = true;
    positionNearCursor();
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
