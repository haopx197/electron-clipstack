import { Tray, Menu, nativeImage, app } from "electron";
import { existsSync } from "fs";
import { join } from "path";
import { toggleWindow } from "./windowManager";

let tray: Tray | null = null;

function resolveTrayIconPath(): string {
    const candidates = [
        join(process.resourcesPath, "app.asar.unpacked", "resources", "trayIconTemplate.png"),
        join(process.resourcesPath, "resources", "trayIconTemplate.png"),
        join(__dirname, "../../resources/trayIconTemplate.png")
    ];
    for (const p of candidates) {
        if (existsSync(p)) return p;
    }
    return candidates[candidates.length - 1];
}

export function createTray(): Tray {
    const iconPath = resolveTrayIconPath();
    const image = nativeImage.createFromPath(iconPath);
    if (iconPath.includes("Template")) {
        image.setTemplateImage(true);
    }

    tray = new Tray(image);
    tray.setToolTip("ClipStack");
    // Disable double-click detection so each tap fires `click` immediately —
    // no ~250ms delay or swallowed double-click → toggle as fast as hotkey.
    tray.setIgnoreDoubleClickEvents(true);

    tray.on("click", () => {
        if (!tray) return;
        toggleWindow();
    });

    tray.on("right-click", () => {
        if (!tray) return;
        const menu = Menu.buildFromTemplate([
            {
                label: "Show ClipStack",
                click: () => {
                    if (tray) toggleWindow();
                }
            },
            { type: "separator" },
            { label: "Quit", click: () => app.quit() }
        ]);
        tray.popUpContextMenu(menu);
    });

    return tray;
}

export function getTray(): Tray | null {
    return tray;
}
