import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { app, screen } from "electron";
import { existsSync } from "fs";
import { join } from "path";

// Persistent Swift child (native/ClipStackHelper.swift). Line protocol over
// stdin/stdout. Requires Accessibility permission.
type Line = string;

let child: ChildProcessWithoutNullStreams | null = null;
let stdoutBuffer = "";

let mouseClickListener: ((x: number, y: number) => void) | null = null;
let clipboardChangedListener: (() => void) | null = null;
let accessibilityChangedListener: (() => void) | null = null;
// FIFO of pending `ax-status` request resolvers. Query is idempotent — each
// query pushes a resolver, each response pops the front. Order is preserved
// because helper handles the queue on its main dispatch queue serially.
const axStatusWaiters: ((v: boolean) => void)[] = [];
// POSIX paths pushed by helper via NSURL → resolves /.file/id=<inode>.
let pasteboardFilePaths: string[] = [];
// PNG temp file the helper dumps from pasteboard via NSImage — catches legacy
// OSType flavors Electron readImage misses (e.g. Chrome/Facebook write only `PNGf`).
let pasteboardImagePath: string | null = null;

function resolveHelperPath(): string {
    // The helper is packaged as `ClipStack.app` in `Contents/Frameworks/`
    // (via electron-builder `extraFiles`). Launch Services indexes standard
    // helper locations like Frameworks/ but NOT nested Resources paths, so
    // this placement is what lets macOS show the ClipStack icon in the
    // Accessibility settings list (icon.icns is inside the helper bundle).
    // The .app folder is named `ClipStack.app` (not `ClipStackHelper.app`)
    // because System Settings uses the folder basename for display. The
    // binary inside is still `ClipStackHelper` — that name is what shows up
    // in `ps` output, and keeping it distinct from the parent's `ClipStack`
    // executable makes debugging easier.
    // `process.resourcesPath` in packaged app is `Contents/Resources`, so
    // `..` = `Contents/`.
    const exe = "ClipStack.app/Contents/MacOS/ClipStackHelper";
    const candidates = [
        join(process.resourcesPath, "..", "Frameworks", exe),
        join(__dirname, "..", "..", "resources", exe)
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1];
}

function resolveDisclaimSpawnerPath(): string | null {
    // TCC responsibility disclaimer — see native/DisclaimSpawner.swift for
    // the full rationale. Without this shim, macOS attributes the helper's
    // Accessibility requests to the parent bundle (com.clipstack.app) instead
    // of the helper's own bundle (com.clipstack.helper), and grants routed to
    // the parent don't unlock the helper's own `AXIsProcessTrusted()` check.
    const candidates = [
        join(process.resourcesPath, "..", "Frameworks", "DisclaimSpawner"),
        join(__dirname, "..", "..", "resources", "DisclaimSpawner")
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
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
        case "pb-image":
            pasteboardImagePath = rest.length === 0 ? null : rest;
            return;
        case "clipboard-changed":
            clipboardChangedListener?.();
            return;
        case "ax-changed":
            accessibilityChangedListener?.();
            return;
        case "click": {
            if (!mouseClickListener) return;
            const [xs, ys] = rest.split(",");
            const xEv = parseFloat(xs);
            const yEv = parseFloat(ys);
            if (!Number.isFinite(xEv) || !Number.isFinite(yEv)) return;
            // Swift returns NSEvent coords (bottom-left). Electron uses top-left.
            const primary = screen.getPrimaryDisplay();
            mouseClickListener(xEv, primary.bounds.y + primary.bounds.height - yEv);
            return;
        }
        case "ax-status": {
            const resolve = axStatusWaiters.shift();
            resolve?.(rest === "true");
            return;
        }
        // ack-only response — ignore silently.
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

export function getPasteboardFilePaths(): string[] {
    return pasteboardFilePaths;
}

export function getPasteboardImagePath(): string | null {
    return pasteboardImagePath;
}

export function startHelper(): void {
    if (child) return;
    const p = resolveHelperPath();
    if (!existsSync(p)) {
        console.error("[clipstack] helper binary not found:", p);
        return;
    }
    // Route the spawn through DisclaimSpawner so macOS TCC treats the helper
    // as its own responsible process (see resolveDisclaimSpawnerPath).
    // Falling back to a direct spawn keeps things running even if the shim
    // is somehow missing — grant routing will be wrong but the app still
    // functions once the user grants the parent bundle.
    const shim = resolveDisclaimSpawnerPath();
    if (shim) {
        child = spawn(shim, [p], { stdio: ["pipe", "pipe", "pipe"] });
    } else {
        console.warn("[clipstack] DisclaimSpawner not found; spawning helper directly");
        child = spawn(p, [], { stdio: ["pipe", "pipe", "pipe"] });
    }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    // Swallow async EPIPE so main doesn't crash after helper exit (shutdown:
    // SIGINT kills whole process group → write into broken pipe).
    child.stdin.on("error", () => {
        // silent — expected on shutdown
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

// Fire-and-forget Cmd+V. Helper tracks target via NSWorkspace notification,
// activates + waits (isActive == true) then posts CGEvent Cmd+V.
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

// Native NSPasteboard.changeCount poll — only notifies on change. False →
// caller should fall back to Node setInterval.
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

// The helper subscribes to `com.apple.accessibility.api` on
// NSDistributedNotificationCenter and emits `ax-changed` when it fires. Doing
// the subscription in the helper (not in Electron main) is deliberate: it
// means the .app bundle process makes zero AX-adjacent syscalls, so it never
// gets registered as an AX-eligible client in the System Settings pane.
export function setAccessibilityChangedListener(cb: () => void): void {
    accessibilityChangedListener = cb;
}

// Ask the helper to raise macOS's native "grant Accessibility" modal — the
// same one that used to appear when the user tried to paste while untrusted.
// The modal has an "Open System Settings" button that jumps straight to the
// AX pane with our helper highlighted. Fire-and-forget; the modal is
// user-driven from there.
export function promptAxViaHelper(): void {
    write("prompt-ax");
}

// Query the helper's own `AXIsProcessTrusted()`. This is the value that
// actually matters — the helper is the process that posts CGEvents and hosts
// the global mouse monitor. If the helper isn't running or takes too long to
// respond, returns false so the banner errs on the safe side. 1s timeout is
// generous: helper handles this on its main dispatch queue with no I/O.
export function queryHelperAxStatus(): Promise<boolean> {
    if (!child) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (v: boolean): void => {
            if (done) return;
            done = true;
            resolve(v);
        };
        axStatusWaiters.push(finish);
        if (!write("ax-status")) {
            const i = axStatusWaiters.indexOf(finish);
            if (i >= 0) axStatusWaiters.splice(i, 1);
            finish(false);
            return;
        }
        setTimeout(() => {
            const i = axStatusWaiters.indexOf(finish);
            if (i >= 0) axStatusWaiters.splice(i, 1);
            finish(false);
        }, 1000);
    });
}
