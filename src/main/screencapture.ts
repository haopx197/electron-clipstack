import { execFile, execFileSync } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Tracks whether *this* session wrote `target=clipboard`. Only when true do
// we restore on quit / toggle-off — never clobber a value the user set
// themselves before installing ClipStack.
let sessionModified = false;

async function readCurrentTarget(): Promise<string> {
    try {
        const { stdout } = await execFileAsync("defaults", [
            "read",
            "com.apple.screencapture",
            "target"
        ]);
        return stdout.trim();
    } catch {
        // Key not set → macOS default = "file".
        return "";
    }
}

// screencaptureui daemon caches the setting; SystemUIServer restart is the
// canonical trigger. Tray NSStatusItem lives independently and is unaffected.
async function killSystemUIServer(): Promise<void> {
    try {
        await execFileAsync("killall", ["SystemUIServer"]);
    } catch {
        // best-effort — applies after next logout if this fails.
    }
}

// Apply the user's chosen setting to macOS.
// enabled=true  → write target=clipboard (if not already).
// enabled=false → delete the key (only if this session set it).
export async function applyCaptureToClipboard(enabled: boolean): Promise<void> {
    if (enabled) {
        const current = await readCurrentTarget();
        if (current === "clipboard") {
            sessionModified = true;
            return;
        }
        try {
            await execFileAsync("defaults", [
                "write",
                "com.apple.screencapture",
                "target",
                "clipboard"
            ]);
            sessionModified = true;
            await killSystemUIServer();
        } catch (err) {
            console.error(
                "[clipstack] defaults write com.apple.screencapture failed:",
                (err as Error).message
            );
        }
        return;
    }

    if (!sessionModified) return;
    try {
        await execFileAsync("defaults", ["delete", "com.apple.screencapture", "target"]);
        sessionModified = false;
        await killSystemUIServer();
    } catch (err) {
        console.error(
            "[clipstack] defaults delete com.apple.screencapture failed:",
            (err as Error).message
        );
    }
}

// Synchronous restore called from `will-quit`. Async handlers can be
// truncated when the event loop is torn down, so use execFileSync here.
// Runs only if this session actually wrote the key.
export function restoreScreenshotTarget(): void {
    if (!sessionModified) return;
    try {
        execFileSync("defaults", ["delete", "com.apple.screencapture", "target"], {
            stdio: "ignore"
        });
        execFileSync("killall", ["SystemUIServer"], { stdio: "ignore" });
        sessionModified = false;
    } catch (err) {
        console.error("[clipstack] failed to restore screencapture target:", (err as Error).message);
    }
}
