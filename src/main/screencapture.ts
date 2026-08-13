import { execFile } from "child_process";

/**
 * Đặt macOS screenshot default target = clipboard. Sau lần chạy này, Cmd+Shift+3/4/5
 * đều bỏ image thẳng vào NSPasteboard thay vì save file → ClipStack watcher pick up.
 *
 * Tại sao không dùng globalShortcut để intercept Cmd+Shift+4:
 *   Carbon `RegisterEventHotKey` (backend của Electron `globalShortcut`) không override
 *   được screenshot shortcuts — macOS WindowServer/screencaptureui consume phím ở tầng
 *   dưới, `register()` return true nhưng callback không fire. Đây là lý do Paste,
 *   Alfred, và các clipboard manager khác không làm hướng này.
 *
 * Idempotent: đọc trước, chỉ ghi + `killall SystemUIServer` khi target hiện tại
 * khác `clipboard` → tránh menubar flash mỗi lần app start.
 *
 * Không auto-restore lúc quit: user cài ClipStack chính vì muốn behavior này, restore
 * on quit → flap mỗi lần restart app. Muốn undo: `defaults delete com.apple.screencapture target`
 * hoặc `defaults write com.apple.screencapture target file` rồi `killall SystemUIServer`.
 */
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
                // screencaptureui daemon cache setting → cần reload. SystemUIServer restart
                // là canonical trigger; Electron `Tray` (NSStatusItem) tồn tại độc lập, không
                // bị mất khi SystemUIServer restart.
                execFile("killall", ["SystemUIServer"], () => {
                    // best-effort — nếu killall fail (rare), setting sẽ apply sau logout kế.
                });
            }
        );
    });
}