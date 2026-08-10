import { ipcMain, clipboard, nativeImage, BrowserWindow, app } from "electron";
import { readFileSync } from "fs";
import { IPC } from "../shared/ipc";
import { getItems, pinItem, deleteItem, clearAll, findItem, getHotkey } from "./store";
import { markClipboardAsCurrent } from "./clipboardWatcher";
import { simulatePasteViaHelper } from "./helper";
import { changeHotkey } from "./hotkey";
import { getMainWindow, hideWindow } from "./windowManager";
import { ClipboardItem } from "../shared/types";

// Detect SVG từ MAGIC/content — cần biết để tách flow paste (SVG không đi qua
// nativeImage). Các format raster khác auto detect qua nativeImage.createFromBuffer.
function sniffUti(bytes: Buffer): "public.svg-image" | null {
    if (bytes.length < 4) return null;
    const head = bytes.subarray(0, 2048).toString("utf8");
    if (/<svg[\s>]/i.test(head)) return "public.svg-image";
    return null;
}

// Strip tags → text preview (fallback khi item.preview không có, ví dụ html chỉ có
// mỗi HTML representation không kèm plain-text). Đủ dùng cho hầu hết editor.
function htmlToText(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function writeItemToClipboard(item: ClipboardItem): void {
    clipboard.clear();

    switch (item.type) {
        case "text": {
            clipboard.writeText(item.content);
            return;
        }
        case "html": {
            // Fallback: nếu không có preview thì strip tags để text-only paste target
            // (VD Notes, terminal, plaintext editor) vẫn nhận được nội dung.
            const text = (item.preview ?? "").trim() || htmlToText(item.content);
            clipboard.write({ text, html: item.content });
            return;
        }
        case "rtf": {
            // RTF strip tag phức tạp (cần parser). Nếu không có preview thì bỏ text —
            // apps đọc rtf sẽ nhận đúng, apps chỉ đọc text sẽ blank (acceptable).
            clipboard.write({ text: item.preview ?? "", rtf: item.content });
            return;
        }
        case "bookmark": {
            // Electron `clipboard.write()`: `bookmark` = title, URL đi trong `text`.
            clipboard.write({
                text: item.content,
                bookmark: item.bookmarkTitle ?? ""
            });
            return;
        }
        case "file": {
            // Path text (cho text editor) + file-url UTI (cho Finder/File apps).
            clipboard.writeText(item.content);
            try {
                clipboard.writeBuffer(
                    "public.file-url",
                    Buffer.from(`file://${encodeURI(item.content)}`, "utf8")
                );
            } catch {
                // best-effort
            }
            return;
        }
        case "image": {
            let bytes: Buffer;
            try {
                bytes = readFileSync(item.content);
            } catch {
                return;
            }
            const uti = sniffUti(bytes);

            // SVG: chỉ write text (source). KHÔNG dùng `writeBuffer("public.svg-image")`
            // vì Apple docs `setData:forType:` yêu cầu `declareTypes:owner:` gọi trước,
            // mà Electron writeBuffer KHÔNG declare → setData silent-fail hoặc corrupt
            // pasteboard state → user paste ra rỗng. Text-only đảm bảo paste vào text
            // editor (Notes/Slack/TextEdit) luôn ra SVG source. (Vector paste vào Figma
            // cần render SVG → PNG trước, không làm ở MVP.)
            if (uti === "public.svg-image") {
                clipboard.writeText(bytes.toString("utf8"));
                return;
            }

            // Raster formats: `clipboard.write({image})` dùng NSPasteboard writeObjects
            // — auto declare types NSPasteboardTypeTIFF/PNG. Apps đọc image standard OK.
            const image = nativeImage.createFromBuffer(bytes);
            if (!image.isEmpty()) {
                clipboard.write({ image });
            }
            return;
        }
    }
}

export function registerIpcHandlers(): void {
    ipcMain.handle(IPC.ClipboardGetItems, () => getItems());

    ipcMain.handle(IPC.ClipboardPasteItem, async (_e, id: string) => {
        const item = findItem(id);
        if (!item) return;

        writeItemToClipboard(item);
        markClipboardAsCurrent();
        hideWindow();
        // Item click activate app ClipStack (window default focusable). Cần yield
        // activation cho target TRƯỚC KHI Cmd+V, else macOS 14+ Cooperative
        // Activation chặn helper's `target.activate()` → Cmd+V bay vào ClipStack.
        //
        // Dùng event `did-resign-active` (Electron API chuẩn) chờ app THỰC SỰ
        // deactivate xong (macOS đã restore target frontmost) rồi mới paste →
        // deterministic. Bug cũ "paste chỉ được lần đầu" là do fire-and-forget
        // `app.hide()` + immediate paste: lần 2, helper's poll 300ms không kịp
        // thấy target active → Cmd+V lạc chỗ.
        //
        // Fallback 200ms để không hang: nếu app đã không active (rare) hoặc
        // event không fire vì race, vẫn paste. Native poll bên Swift helper
        // (300ms hardstop) bắt tiếp cho case target chưa reactivate.
        let done = false;
        const onResign = (): void => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            simulatePasteViaHelper();
        };
        app.once("did-resign-active", onResign);
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            app.removeListener("did-resign-active", onResign);
            simulatePasteViaHelper();
        }, 200);
        app.hide();
    });

    ipcMain.handle(IPC.ClipboardPinItem, (_e, id: string) => pinItem(id));
    ipcMain.handle(IPC.ClipboardDeleteItem, (_e, id: string) => deleteItem(id));
    ipcMain.handle(IPC.ClipboardClearAll, () => clearAll());

    ipcMain.handle(IPC.SettingsGetHotkey, () => getHotkey());
    ipcMain.handle(IPC.SettingsSetHotkey, (_e, accelerator: string) => changeHotkey(accelerator));

    ipcMain.handle(IPC.WindowHide, () => hideWindow());
}

export function broadcastItemsUpdated(): void {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.ClipboardItemsUpdated, getItems());
    }
    for (const w of BrowserWindow.getAllWindows()) {
        if (w !== win && !w.isDestroyed()) {
            w.webContents.send(IPC.ClipboardItemsUpdated, getItems());
        }
    }
}
