import { execFile } from "child_process";

export function simulatePaste(): void {
    execFile("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down'], (err) => {
        if (err) {
            console.error("[clipstack] simulatePaste failed:", err.message);
        }
    });
}
