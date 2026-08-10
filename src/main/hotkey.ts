import { globalShortcut } from "electron";
import { getHotkey, setHotkey } from "./store";
import { SetHotkeyResult } from "../shared/types";
import { toggleWindow } from "./windowManager";

let currentAccelerator: string | null = null;

const toggle = (): void => toggleWindow();

function registerAccelerator(accel: string): SetHotkeyResult {
    try {
        if (currentAccelerator) globalShortcut.unregister(currentAccelerator);
        const ok = globalShortcut.register(accel, toggle);
        if (!ok) {
            if (currentAccelerator) globalShortcut.register(currentAccelerator, toggle);
            return { ok: false, error: `Hotkey "${accel}" is not available` };
        }
        currentAccelerator = accel;
        return { ok: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (currentAccelerator) {
            try {
                globalShortcut.register(currentAccelerator, toggle);
            } catch {
                // ignore
            }
        }
        return { ok: false, error: message };
    }
}

export function registerHotkey(): SetHotkeyResult {
    return registerAccelerator(getHotkey());
}

export function changeHotkey(accelerator: string): SetHotkeyResult {
    const prev = currentAccelerator;
    const result = registerAccelerator(accelerator);
    if (result.ok) setHotkey(accelerator);
    else if (prev) currentAccelerator = prev;
    return result;
}

export function unregisterAllHotkeys(): void {
    globalShortcut.unregisterAll();
    currentAccelerator = null;
}
