import { execFile } from "child_process";

// Set screenshot default target = clipboard → Cmd+Shift+3/4/5 goes to pasteboard
// instead of file. globalShortcut can't intercept: Carbon
// `RegisterEventHotKey` doesn't override screenshot shortcuts.
// Idempotent: only write + killall when current target differs from `clipboard`.
// No auto-restore on quit — users install ClipStack specifically for this behavior.
export function ensureScreenshotTargetIsClipboard(): void {
    execFile("defaults", ["read", "com.apple.screencapture", "target"], (readErr, stdout) => {
        const current = readErr ? "" : stdout.trim();
        if (current === "clipboard") return;

        execFile(
            "defaults",
            ["write", "com.apple.screencapture", "target", "clipboard"],
            (writeErr) => {
                if (writeErr) {
                    console.error(
                        "[clipstack] defaults write com.apple.screencapture failed:",
                        writeErr.message
                    );
                    return;
                }
                // screencaptureui daemon caches the setting → SystemUIServer restart
                // is the canonical trigger. Tray NSStatusItem lives independently.
                execFile("killall", ["SystemUIServer"], () => {
                    // best-effort — if it fails, setting applies after next logout.
                });
            }
        );
    });
}