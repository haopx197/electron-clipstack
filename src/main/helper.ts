import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { app, screen } from "electron";
import { existsSync } from "fs";
import { join } from "path";

// Persistent Swift child process (native/ClipStackHelper.swift). Giao thức
// text line-based qua stdin/stdout. Cần Accessibility permission.
type Line = string;

let child: ChildProcessWithoutNullStreams | null = null;
let stdoutBuffer = "";

let mouseClickListener: ((x: number, y: number) => void) | null = null;
let clipboardChangedListener: (() => void) | null = null;
// Cache real POSIX paths của file URLs trên pasteboard, do helper Swift push
// mỗi khi clipboard đổi (đọc qua NSURL nên resolve được /.file/id=<inode>).
let pasteboardFilePaths: string[] = [];

function resolveHelperPath(): string {
    const candidates = [
        join(process.resourcesPath, "resources", "ClipStackHelper"),
        join(__dirname, "../../resources/ClipStackHelper")
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1];
}

function write(cmd: string): boolean {
    if (!child) return false;
    try {
        child.stdin.write(cmd + "\n");
        return true;
    } catch {
        return false;
    }
}

function handleLine(line: Line): void {
    if (!line) return;
    const sep = line.indexOf(":");
    const key = sep === -1 ? line : line.slice(0, sep);
    const rest = sep === -1 ? "" : line.slice(sep + 1);

    switch (key) {
        case "pb-files":
            pasteboardFilePaths = rest.length === 0 ? [] : rest.split("\t");
            return;
        case "clipboard-changed":
            clipboardChangedListener?.();
            return;
        case "click": {
            if (!mouseClickListener) return;
            const [xs, ys] = rest.split(",");
            const xEv = parseFloat(xs);
            const yEv = parseFloat(ys);
            if (!Number.isFinite(xEv) || !Number.isFinite(yEv)) return;
            // Swift trả toạ độ NSEvent (bottom-left). Electron dùng top-left.
            const primary = screen.getPrimaryDisplay();
            mouseClickListener(xEv, primary.bounds.y + primary.bounds.height - yEv);
            return;
        }
        // ack-only responses — ignore silently.
        case "paste":
        case "mouse-start":
        case "mouse-stop":
        case "pb-watch-start":
        case "pb-watch-stop":
            return;
        case "error":
            console.warn("[clipstack] helper:", line);
            return;
        default:
            console.warn("[clipstack] helper unknown line:", line);
    }
}

// Real POSIX paths của mọi file đang có trên pasteboard, do helper resolve từ
// NSURL. Rỗng nếu clipboard không có file. Cập nhật realtime mỗi lần helper
// phát hiện clipboard đổi (push TRƯỚC clipboard-changed).
export function getPasteboardFilePaths(): string[] {
    return pasteboardFilePaths;
}

export function startHelper(): void {
    if (child) return;
    const p = resolveHelperPath();
    if (!existsSync(p)) {
        console.error("[clipstack] helper binary not found:", p);
        return;
    }
    child = spawn(p, [], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    // Nuốt async EPIPE để không crash Electron main khi helper đã exit (thường
    // xảy ra lúc shutdown: SIGINT giết cả process group, helper chết trước khi
    // stopHelper gửi "quit" → write vào broken pipe).
    child.stdin.on("error", () => {
        // silent — expected during shutdown
    });
    child.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        let idx: number;
        while ((idx = stdoutBuffer.indexOf("\n")) >= 0) {
            handleLine(stdoutBuffer.slice(0, idx));
            stdoutBuffer = stdoutBuffer.slice(idx + 1);
        }
    });
    child.stderr.on("data", (chunk: string) => {
        console.error("[clipstack] helper stderr:", chunk.trim());
    });
    child.on("exit", (code, signal) => {
        console.warn("[clipstack] helper exited:", code, signal);
        child = null;
    });

    app.on("will-quit", stopHelper);
}

export function stopHelper(): void {
    if (!child) return;
    const c = child;
    child = null;
    try {
        if (c.stdin && !c.stdin.destroyed && c.stdin.writable) {
            c.stdin.write("quit\n", () => {
                try {
                    c.stdin.end();
                } catch {
                    // ignore
                }
            });
        }
    } catch {
        // ignore
    }
    try {
        c.kill();
    } catch {
        // ignore
    }
}

// Fire-and-forget Cmd+V. Helper tự track target app qua NSWorkspace
// notification, activate + wait deterministic (isActive == true) rồi post
// CGEvent Cmd+V.
export function simulatePasteViaHelper(): void {
    write("paste");
}

export function startMouseMonitor(cb: (x: number, y: number) => void): void {
    mouseClickListener = cb;
    write("mouse-start");
}

export function stopMouseMonitor(): void {
    mouseClickListener = null;
    write("mouse-stop");
}

// Native NSPasteboard.changeCount poll — chỉ notify khi count đổi. Trả true
// nếu helper đang chạy; false → caller nên fallback setInterval bên Node.
export function startClipboardWatch(cb: () => void): boolean {
    if (!child) return false;
    clipboardChangedListener = cb;
    if (!write("pb-watch-start")) {
        clipboardChangedListener = null;
        return false;
    }
    return true;
}

export function stopClipboardWatch(): void {
    clipboardChangedListener = null;
    write("pb-watch-stop");
}
