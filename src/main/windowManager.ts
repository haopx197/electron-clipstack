import { app, BrowserWindow, Rectangle, screen } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { DEFAULT_WINDOW_SIZE } from "../shared/types";
import { startMouseMonitor, stopMouseMonitor } from "./helper";
import { getTray } from "./tray";

let mainWindow: BrowserWindow | null = null;
// Track state qua biến JS INLINE-ONLY (không register show/hide event listener →
// không dual-write race). Lý do KHÔNG dùng `mainWindow.isVisible()`: sau
// `showInactive()`/`hide()`, macOS Electron IPC query `[NSWindow isVisible]` có
// thể lag/stale trong vài ms — rapid tray click thấy state cũ → toggle sai
// (click 2 thấy visible=false → showWindow lại → window "cứ mở"). Biến JS set
// inline ngay sau show/hide call → luôn khớp intent, rapid click toggle chuẩn.
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
        // Fixed dưới tray, user không thể kéo đi chỗ khác.
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
            // Không throttle renderer khi window hidden → paint state luôn sẵn
            // sàng khi hiện lên, tray click on/off không phải chờ renderer wake.
            backgroundThrottling: false
        }
    });

    mainWindow.setAlwaysOnTop(true, "floating");
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // KHÔNG đăng ký blur handler (blur race với tray.click) hoặc show/hide event
    // handler (dual-write state race). Mọi đóng đi qua hideWindow() explicit:
    // mouse-monitor click ngoài, tray toggle, hotkey toggle, item click, Esc.

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
    // Click trong window → giữ open (renderer tự xử lý click item để paste + hide).
    if (isPointInRect(x, y, mainWindow.getBounds())) return;
    // Click trong menubar strip (tray, menu items, notch) → không hide, tray.click
    // sẽ tự toggle. Dùng display của click point (multi-monitor safe).
    const display = screen.getDisplayNearestPoint({ x, y });
    if (y < display.workArea.y) return;
    hideWindow();
}

// Luôn position dưới tray icon (spec LOCKED — CLAUDE.md).
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
    // Chỉ unhide khi app THỰC SỰ hidden — tránh call app.show() thừa gây macOS
    // re-activation animation. Scenario cần: sau paste (app.hide đã chạy).
    if (app.isHidden()) app.show();
    // showInactive: order-front, không lấy key/focus → app user đang gõ giữ nguyên caret.
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
