import { clipboard, nativeImage } from "electron";
import { createHash } from "crypto";
import { basename } from "path";
import { readFileSync, realpathSync } from "fs";
import { addItem } from "./store";
import { saveImage, saveImageBytes } from "./images";
import { getPasteboardFilePaths, startClipboardWatch, stopClipboardWatch } from "./helper";

function tryRealpath(p: string): string {
    try {
        return realpathSync(p);
    } catch {
        return p;
    }
}

/**
 * Detect image format qua magic bytes / content signature.
 *
 * Kết quả gồm extension + `needsConversion`:
 *   - `false` = renderer <img> render trực tiếp được → save raw bytes.
 *   - `true`  = Chromium không render (TIFF, HEIC) → qua nativeImage → PNG.
 *
 * Dựa vào MAGIC BYTES chứ không phải extension: bắt được cả file rename sai,
 * `.file/id=<inode>` không có extension, hay clipboard image data thô.
 */
type SniffResult = { ext: string; needsConversion: boolean } | null;

function sniffImageFormat(bytes: Buffer): SniffResult {
    if (bytes.length < 12) return null;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
        return { ext: "png", needsConversion: false };
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return { ext: "jpg", needsConversion: false };
    // GIF87a / GIF89a — save raw để giữ animation (nativeImage chỉ load frame đầu)
    if (
        bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
    )
        return { ext: "gif", needsConversion: false };
    // BMP
    if (bytes[0] === 0x42 && bytes[1] === 0x4d)
        return { ext: "bmp", needsConversion: false };
    // WEBP: RIFF....WEBP (cần cả 2 tag để không nhầm WAV/AVI)
    if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    )
        return { ext: "webp", needsConversion: false };
    // ICO
    if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00)
        return { ext: "ico", needsConversion: false };
    // TIFF (browser không render → convert qua nativeImage)
    if (
        (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
        (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
    )
        return { ext: "tiff", needsConversion: true };
    // ISO-BMFF (HEIC/HEIF/AVIF): "ftyp" tại offset 4, brand tại offset 8. Lọc để tránh MP4/MOV.
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        const brand = bytes.subarray(8, 12).toString("ascii").toLowerCase();
        if (brand === "avif") return { ext: "avif", needsConversion: false }; // Chromium 85+ render
        if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand))
            return { ext: "heic", needsConversion: true };
    }
    // SVG: XML text. Có thể có BOM, XML decl, comments, DOCTYPE trước `<svg`.
    const head = bytes.subarray(0, 2048).toString("utf8");
    if (/<svg[\s>]/i.test(head)) return { ext: "svg", needsConversion: false };

    return null;
}

// Fallback interval khi helper không sẵn sàng (chưa spawn, crash, chưa cấp
// Accessibility permission). Native path dùng NSPasteboard.changeCount 100ms
// và chỉ notify khi thực sự đổi — không cần đặt số này.
const FALLBACK_POLL_INTERVAL_MS = 400;

let lastSignature: string | null = null;
let fallbackTimer: NodeJS.Timeout | null = null;
let usingHelper = false;
let onUpdate: (() => void) | null = null;

function sha1(input: string | Buffer): string {
    return createHash("sha1").update(input).digest("hex");
}

/**
 * Lấy real POSIX path của file đầu tiên trên pasteboard.
 *
 * Ưu tiên cache do helper Swift push qua NSURL — bắt được cả file-reference URL
 * dạng `/.file/id=<inode>` mà POSIX `open()` từ chối. Fallback đọc `public.file-url`
 * trực tiếp bằng Electron API khi helper chưa spawn / chưa cấp Accessibility.
 */
function readFirstFilePath(): string | null {
    const cached = getPasteboardFilePaths();
    if (cached.length > 0) return cached[0];
    try {
        const buf = clipboard.readBuffer("public.file-url");
        if (!buf || buf.length === 0) return null;
        const url = buf.toString("utf8").trim().replace(/\0+$/, "");
        if (!url.startsWith("file://")) return null;
        return decodeURIComponent(url.replace(/^file:\/\//, ""));
    } catch {
        return null;
    }
}

function readBookmarkSafe(): { title: string; url: string } | null {
    try {
        const bm = clipboard.readBookmark();
        if (bm && bm.url) return { title: bm.title || "", url: bm.url };
    } catch {
        // some macOS versions throw when no bookmark is present
    }
    return null;
}

/**
 * Đọc pasteboard hiện tại → xác định representation chính để hiển thị.
 *
 * Một copy trên macOS luôn có NHIỀU representations cùng lúc (public.file-url +
 * public.png từ Finder; public.html + public.utf8-plain-text từ browser/Slack; v.v.).
 * Không có khái niệm "type gốc" — mình phải chọn 1 để hiển thị. Quy tắc:
 *
 *   1. Có `public.file-url`               → user copy file (image ext ⇒ đọc file thật, khác ⇒ file)
 *   2. Có image data (không kèm file-url) → image data trực tiếp (screenshot, Preview, Photoshop…)
 *   3. Có `public.url-name` + bookmark    → bookmark (Safari address bar)
 *   4. Có plain-text                      → text (mọi copy text-like đều có plain-text)
 *   5. Chỉ có html (không plain-text)     → html thuần (hiếm)
 *   6. Chỉ có rtf (không plain-text)      → rtf thuần (hiếm)
 *
 * Bước 4 đứng trước 5/6 để text copy từ browser/Slack không bị mặc định thành HTML.
 *
 * Chỉ gọi `clipboard.readXXX()` khi format thực sự có mặt — tránh trigger
 * CoreText/AppKit parse paths không cần thiết (`readRTF`/`readHTML` chạm font
 * system → macOS log "CoreText note: .SFNS-Regular ..." spam mỗi call).
 */
function captureCurrent(): { sig: string; save: () => void } | null {
    const has = (fmt: string): boolean => {
        try {
            return clipboard.has(fmt);
        } catch {
            return false;
        }
    };

    // 1) File copy từ Finder — kể cả khi kèm image preview, luôn ưu tiên file gốc.
    //    Đọc bytes → sniff magic:
    //      • Format browser render được (PNG/JPEG/GIF/BMP/WEBP/SVG/ICO/AVIF) → save raw
    //      • Format cần convert (TIFF/HEIC) → nativeImage → PNG
    //      • Không phải ảnh → file (giữ path, không copy nội dung)
    if (has("public.file-url")) {
        const rawPath = readFirstFilePath();
        if (rawPath) {
            let bytes: Buffer | null = null;
            try {
                bytes = readFileSync(rawPath);
            } catch {
                // fall through to file case
            }
            if (bytes && bytes.length > 0) {
                const sniff = sniffImageFormat(bytes);
                if (sniff && !sniff.needsConversion) {
                    const contentBytes = bytes;
                    const ext = sniff.ext;
                    const sig = `img:${sha1(contentBytes)}`;
                    return {
                        sig,
                        save: () => {
                            const path = saveImageBytes(contentBytes, ext);
                            addItem({ type: "image", content: path });
                        }
                    };
                }
                if (sniff && sniff.needsConversion) {
                    const img = nativeImage.createFromBuffer(bytes);
                    if (!img.isEmpty()) {
                        const png = img.toPNG();
                        if (png.length > 0) {
                            const sig = `img:${sha1(png)}`;
                            return {
                                sig,
                                save: () => {
                                    const path = saveImage(nativeImage.createFromBuffer(png));
                                    addItem({ type: "image", content: path });
                                }
                            };
                        }
                    }
                }
            }
            // File thường. Resolve real path cho display; fail thì fallback raw path.
            const displayPath = tryRealpath(rawPath);
            const sig = `file:${displayPath}`;
            return {
                sig,
                save: () =>
                    addItem({ type: "file", content: displayPath, fileName: basename(displayPath) })
            };
        }
    }

    // 2) Image data trực tiếp — chỉ khi KHÔNG có file-url (để không nhầm preview
    //    của Finder ở bước 1 đã bắt).
    if (has("public.tiff") || has("public.png")) {
        const image = clipboard.readImage();
        if (!image.isEmpty()) {
            const png = image.toPNG();
            const sig = `img:${sha1(png)}`;
            return {
                sig,
                save: () => {
                    const path = saveImage(nativeImage.createFromBuffer(png));
                    addItem({ type: "image", content: path });
                }
            };
        }
    }

    // 3) Bookmark: chỉ khi có `public.url-name` (Safari attach kèm). `public.url`
    //    một mình không đủ vì text URL bình thường cũng có thể có nó.
    if (has("public.url-name")) {
        const bookmark = readBookmarkSafe();
        if (bookmark) {
            const sig = `bm:${bookmark.url}`;
            const preview = clipboard.readText() || bookmark.title || bookmark.url;
            return {
                sig,
                save: () =>
                    addItem({
                        type: "bookmark",
                        content: bookmark.url,
                        bookmarkTitle: bookmark.title,
                        preview
                    })
            };
        }
    }

    const hasPlainText = has("public.utf8-plain-text") || has("public.plain-text");

    // 4) Plain text — mặc định cho mọi text-like copy (browser, Slack, editor…).
    if (hasPlainText) {
        const text = clipboard.readText();
        if (text) {
            const sig = `txt:${text}`;
            return { sig, save: () => addItem({ type: "text", content: text }) };
        }
    }

    // 5) HTML/RTF thuần: chỉ dùng khi KHÔNG có plain-text (rất hiếm — vài
    //    editor rich text chỉ export html/rtf mà không kèm text).
    if (!hasPlainText && has("public.html")) {
        const html = clipboard.readHTML();
        if (html) {
            const sig = `html:${sha1(html)}`;
            return {
                sig,
                save: () => addItem({ type: "html", content: html })
            };
        }
    }

    if (!hasPlainText && has("public.rtf")) {
        const rtf = clipboard.readRTF();
        if (rtf) {
            const sig = `rtf:${sha1(rtf)}`;
            return {
                sig,
                save: () => addItem({ type: "rtf", content: rtf })
            };
        }
    }

    return null;
}

function poll(): void {
    const cap = captureCurrent();
    if (!cap) return;
    if (cap.sig === lastSignature) return;
    lastSignature = cap.sig;
    cap.save();
    onUpdate?.();
}

export function startClipboardWatcher(cb: () => void): void {
    onUpdate = cb;
    // Seed lastSignature to the current clipboard so we don't re-capture what's already there.
    const cap = captureCurrent();
    lastSignature = cap?.sig ?? null;

    stopClipboardWatcher();

    // Ưu tiên native NSPasteboard.changeCount watch qua helper (poll 100ms trong
    // background thread, chỉ notify khi count đổi → 0 work bên Node lúc idle).
    usingHelper = startClipboardWatch(poll);
    if (usingHelper) return;

    // Fallback JS setInterval nếu helper chưa sẵn sàng (chưa spawn / crash /
    // chưa cấp Accessibility). Giữ chức năng nhưng có overhead + log noise.
    fallbackTimer = setInterval(poll, FALLBACK_POLL_INTERVAL_MS);
}

export function stopClipboardWatcher(): void {
    if (usingHelper) {
        stopClipboardWatch();
        usingHelper = false;
    }
    if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
    }
}

/**
 * After the app itself writes to the clipboard (paste-item), call this to prevent the
 * watcher from re-capturing that write as a "new" copy from the user.
 */
export function markClipboardAsCurrent(): void {
    const cap = captureCurrent();
    lastSignature = cap?.sig ?? null;
}
