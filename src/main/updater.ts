import { app, net } from "electron";
import { spawn } from "child_process";
import { createWriteStream, mkdirSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { IPC } from "../shared/ipc";
import { getMainWindow } from "./windowManager";
import type { UpdateInstallProgress, UpdateStatus } from "../shared/types";

declare const __BUILD_TIMESTAMP__: string;

const REPO_SLUG = "haopx197/electron-clipstack";
const APP_NAME = "ClipStack";

// latest.json is published as a release asset alongside the DMGs:
//   { "timestamp": "1786935663981" }
// The value is a Unix-ms string set by electron-vite via __BUILD_TIMESTAMP__.
// gen-latest-json.sh reads it back out of the compiled main bundle so both
// artifacts always hold the same value.
const LATEST_JSON_URL = `https://github.com/${REPO_SLUG}/releases/latest/download/latest.json`;

function dmgUrl(): string {
    const asset = process.arch === "arm64" ? "clipstack-arm64.dmg" : "clipstack-x64.dmg";
    return `https://github.com/${REPO_SLUG}/releases/latest/download/${asset}`;
}

const CURRENT_TIMESTAMP = typeof __BUILD_TIMESTAMP__ === "string" ? __BUILD_TIMESTAMP__ : "dev";

let status: UpdateStatus = { hasUpdate: false };
let installing = false;

export function getUpdateStatus(): UpdateStatus {
    return status;
}

export async function checkForUpdate(): Promise<void> {
    // Dev builds have no meaningful timestamp to compare against.
    if (CURRENT_TIMESTAMP === "dev") return;
    try {
        const res = await net.fetch(`${LATEST_JSON_URL}?t=${Date.now()}`, { redirect: "follow" });
        if (!res.ok) return;
        const body = (await res.json()) as { timestamp?: unknown };
        const latestTimestamp = typeof body.timestamp === "string" ? body.timestamp.trim() : "";
        if (!latestTimestamp) return;
        status = { hasUpdate: latestTimestamp !== CURRENT_TIMESTAMP };
        // Push so the banner shows even if the renderer mounted before the fetch
        // completed (first-launch race on slow networks).
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.UpdatesStatusUpdated, status);
        }
    } catch {
        // Silent: no network, GitHub down, whatever. Try again next boot.
    }
}

function emitInstallProgress(next: UpdateInstallProgress): void {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.UpdatesInstallProgress, next);
    }
}

async function downloadDmg(destPath: string): Promise<void> {
    const res = await net.fetch(dmgUrl(), { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get("content-length")) || 0;
    let received = 0;
    let lastEmit = 0;

    await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(destPath);
        const reader = res.body!.getReader();
        const pump = async (): Promise<void> => {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                    received += value.byteLength;
                    if (!out.write(Buffer.from(value))) {
                        await new Promise<void>((r) => out.once("drain", () => r()));
                    }
                    const now = Date.now();
                    if (total > 0 && now - lastEmit > 100) {
                        lastEmit = now;
                        emitInstallProgress({
                            phase: "downloading",
                            percent: Math.min(1, received / total),
                            error: null
                        });
                    }
                }
            }
            out.end();
        };
        out.on("error", reject);
        out.on("finish", () => resolve());
        pump().catch(reject);
    });
}

// Detached shell script that runs after the app exits: mount DMG, replace the
// installed bundle, clear quarantine (bundle is unsigned), relaunch.
function buildInstallerScript(dmgPath: string, pid: number, logPath: string): string {
    return `#!/bin/bash
set -e
export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
exec >>"${logPath}" 2>&1
echo "[clipstack-updater] $(date) starting; pid=${pid} dmg=${dmgPath}"

for i in $(seq 1 150); do
    if ! kill -0 ${pid} 2>/dev/null; then break; fi
    sleep 0.2
done

MOUNT="$(hdiutil attach "${dmgPath}" -nobrowse -readonly -mountrandom /tmp | grep -Eo '/tmp/[^ ]+' | tail -1)"
if [[ -z "$MOUNT" || ! -d "$MOUNT/${APP_NAME}.app" ]]; then
    echo "[clipstack-updater] failed to mount or locate app in DMG"
    exit 1
fi

rm -rf "/Applications/${APP_NAME}.app"
cp -R "$MOUNT/${APP_NAME}.app" /Applications/
xattr -cr "/Applications/${APP_NAME}.app" || true
hdiutil detach "$MOUNT" -quiet -force || true
rm -f "${dmgPath}"

open "/Applications/${APP_NAME}.app"
echo "[clipstack-updater] $(date) done"
`;
}

export async function installUpdate(): Promise<void> {
    if (installing || !app.isPackaged) return;
    installing = true;

    const cacheDir = join(app.getPath("userData"), "updates");
    mkdirSync(cacheDir, { recursive: true });
    const dmgPath = join(cacheDir, `${APP_NAME}-update.dmg`);
    const scriptPath = join(tmpdir(), `clipstack-installer-${Date.now()}.sh`);
    const logPath = join(cacheDir, "installer.log");

    try {
        emitInstallProgress({ phase: "downloading", percent: 0, error: null });
        await downloadDmg(dmgPath);
        emitInstallProgress({ phase: "installing", percent: 1, error: null });

        writeFileSync(scriptPath, buildInstallerScript(dmgPath, process.pid, logPath), "utf8");
        chmodSync(scriptPath, 0o755);

        const child = spawn("/bin/bash", [scriptPath], { detached: true, stdio: "ignore" });
        child.unref();

        // Give the user a beat to read "Installing update…" before the window disappears.
        setTimeout(() => app.quit(), 2500);
    } catch (e) {
        installing = false;
        emitInstallProgress({
            phase: "error",
            percent: 0,
            error: e instanceof Error ? e.message : String(e)
        });
    }
}
