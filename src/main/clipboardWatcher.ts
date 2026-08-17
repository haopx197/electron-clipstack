import { clipboard, nativeImage } from "electron";
import { createHash } from "crypto";
import { basename } from "path";
import { readFileSync, realpathSync } from "fs";
import { addItem } from "./store";
import { saveImage, saveImageBytes } from "./images";
import {
    getPasteboardFilePaths,
    getPasteboardImagePath,
    startClipboardWatch,
    stopClipboardWatch
} from "./helper";

function tryRealpath(p: string): string {
    try {
        return realpathSync(p);
    } catch {
        return p;
    }
}

// Standalone URL (no surrounding text) → render as bookmark.
const URL_RE = /^https?:\/\/\S+$/i;

// Fallback when app writes HTML without plain-text.
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

// Detect image format via magic bytes (don't trust extension) — catches
// renamed files and `.file/id=<inode>` without ext. needsConversion=true
// means Chromium <img> can't render (TIFF/HEIC) → needs nativeImage → PNG.
type SniffResult = { ext: string; needsConversion: boolean } | null;

function sniffImageFormat(bytes: Buffer): SniffResult {
    if (bytes.length < 12) return null;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
        return { ext: "png", needsConversion: false };
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return { ext: "jpg", needsConversion: false };
    // GIF: save raw to preserve animation (nativeImage loads only first frame).
    if (
        bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
    )
        return { ext: "gif", needsConversion: false };
    // BMP
    if (bytes[0] === 0x42 && bytes[1] === 0x4d)
        return { ext: "bmp", needsConversion: false };
    // WEBP: RIFF....WEBP (need both tags to avoid WAV/AVI collision).
    if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    )
        return { ext: "webp", needsConversion: false };
    if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00)
        return { ext: "ico", needsConversion: false };
    // TIFF: browser can't render → convert via nativeImage.
    if (
        (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
        (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
    )
        return { ext: "tiff", needsConversion: true };
    // ISO-BMFF (HEIC/HEIF/AVIF): "ftyp" at offset 4, brand at offset 8. Filter brand to avoid MP4/MOV.
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        const brand = bytes.subarray(8, 12).toString("ascii").toLowerCase();
        if (brand === "avif") return { ext: "avif", needsConversion: false };
        if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand))
            return { ext: "heic", needsConversion: true };
    }
    // SVG may have BOM/XML decl/comments/DOCTYPE before `<svg`.
    const head = bytes.subarray(0, 2048).toString("utf8");
    if (/<svg[\s>]/i.test(head)) return { ext: "svg", needsConversion: false };

    return null;
}

let lastSignature: string | null = null;
let onUpdate: (() => void) | null = null;

function sha1(input: string | Buffer): string {
    return createHash("sha1").update(input).digest("hex");
}

// Prefer cache pushed by Swift helper via NSURL — handles file-reference URLs
// like `/.file/id=<inode>` that POSIX `open()` rejects. Electron readBuffer
// fallback returns only ONE path (no multi-URL list exposed).
function readAllFilePaths(): string[] {
    const cached = getPasteboardFilePaths();
    if (cached.length > 0) return cached;
    try {
        const buf = clipboard.readBuffer("public.file-url");
        if (!buf || buf.length === 0) return [];
        const url = buf.toString("utf8").trim().replace(/\0+$/, "");
        if (!url.startsWith("file://")) return [];
        return [decodeURIComponent(url.replace(/^file:\/\//, ""))];
    } catch {
        return [];
    }
}

function buildFileSave(rawPath: string): () => void {
    let bytes: Buffer | null = null;
    try {
        bytes = readFileSync(rawPath);
    } catch {
        // fallback: treat as plain file
    }
    if (bytes && bytes.length > 0) {
        const sniff = sniffImageFormat(bytes);
        if (sniff && !sniff.needsConversion) {
            const contentBytes = bytes;
            const ext = sniff.ext;
            return () => {
                const path = saveImageBytes(contentBytes, ext);
                addItem({ type: "image", content: path });
            };
        }
        if (sniff && sniff.needsConversion) {
            const img = nativeImage.createFromBuffer(bytes);
            if (!img.isEmpty()) {
                const png = img.toPNG();
                if (png.length > 0) {
                    return () => {
                        const path = saveImage(nativeImage.createFromBuffer(png));
                        addItem({ type: "image", content: path });
                    };
                }
            }
        }
    }
    const displayPath = tryRealpath(rawPath);
    return () => addItem({ type: "file", content: displayPath, fileName: basename(displayPath) });
}

function buildFileSig(rawPath: string): string {
    let bytes: Buffer | null = null;
    try {
        bytes = readFileSync(rawPath);
    } catch {
        return `file:${tryRealpath(rawPath)}`;
    }
    if (bytes.length === 0) return `file:${tryRealpath(rawPath)}`;
    const sniff = sniffImageFormat(bytes);
    if (sniff && !sniff.needsConversion) return `img:${sha1(bytes)}`;
    if (sniff && sniff.needsConversion) {
        const img = nativeImage.createFromBuffer(bytes);
        if (!img.isEmpty()) {
            const png = img.toPNG();
            if (png.length > 0) return `img:${sha1(png)}`;
        }
    }
    return `file:${tryRealpath(rawPath)}`;
}

function readBookmarkSafe(): { title: string; url: string } | null {
    try {
        const bm = clipboard.readBookmark();
        if (bm && bm.url) return { title: bm.title || "", url: bm.url };
    } catch {
        // some macOS versions throw when no bookmark present
    }
    return null;
}

// Pasteboard always carries multiple representations (file-url+png, html+text…).
// Priority: 1) file-url  2) image data  3) bookmark (url-name)  4) plain-text
// 5) html-only  6) rtf-only. Text before html so copies from browser/Slack
// don't default to HTML.
//
// Only call `clipboard.readXXX()` when format present — avoids log spam
// "CoreText note: .SFNS-Regular ..." from readRTF/readHTML on every call.
function captureCurrent(): { sig: string; save: () => void } | null {
    const has = (fmt: string): boolean => {
        try {
            return clipboard.has(fmt);
        } catch {
            return false;
        }
    };


    // 1) File from Finder — even if image preview attached, prefer original file.
    //    Iterate reversed so paths[0] gets highest createdAt → top of batch.
    if (has("public.file-url")) {
        const paths = readAllFilePaths();
        if (paths.length > 0) {
            const perFile = paths.map((p) => ({ sig: buildFileSig(p), save: buildFileSave(p) }));
            const combinedSig =
                perFile.length === 1 ? perFile[0].sig : `multi:${sha1(perFile.map((p) => p.sig).join("|"))}`;
            return {
                sig: combinedSig,
                save: () => {
                    for (let i = perFile.length - 1; i >= 0; i--) perFile[i].save();
                }
            };
        }
    }

    // 2a) Swift helper decodes NSImage → PNG temp file. Try BEFORE Electron
    //     readImage to cover legacy OSType flavors (`PNGf`/`JPEG`/`8BPS`…)
    //     written by Chrome/browsers that Electron misses.
    const helperImgPath = getPasteboardImagePath();
    if (helperImgPath) {
        try {
            const bytes = readFileSync(helperImgPath);
            if (bytes.length > 0) {
                const sig = `img:${sha1(bytes)}`;
                return {
                    sig,
                    save: () => {
                        const path = saveImageBytes(bytes, "png");
                        addItem({ type: "image", content: path });
                    }
                };
            }
        } catch {
            // fall through to Electron path
        }
    }

    // 2b) Electron readImage fallback — reached only when helper missing/crashed.
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

    // 3) Bookmark: only when `public.url-name` present (Safari attaches it).
    //    `public.url` alone isn't enough — plain text URLs can carry that UTI too.
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

    // 4) Text — prefer plain-text; strip HTML as fallback if app only wrote HTML.
    //    RTF-only skipped (no parser).
    let text: string | null = null;
    if (hasPlainText) {
        const t = clipboard.readText();
        if (t) text = t;
    } else if (has("public.html")) {
        const html = clipboard.readHTML();
        if (html) {
            const stripped = htmlToText(html);
            if (stripped) text = stripped;
        }
    }

    if (text) {
        // Text is a single URL → bookmark type (no title). Copying a URL from
        // web/chat/doc still preserves the URL string.
        const trimmed = text.trim();
        if (URL_RE.test(trimmed)) {
            const url = trimmed;
            return {
                sig: `bm:${url}`,
                save: () =>
                    addItem({
                        type: "bookmark",
                        content: url,
                        bookmarkTitle: "",
                        preview: url
                    })
            };
        }
        const sig = `txt:${text}`;
        return { sig, save: () => addItem({ type: "text", content: text! }) };
    }

    return null;
}

// Deadline until which any capture is treated as "OUR write" and skipped.
// Time-based (not consume-once) because writeText+writeBuffer can fire two
// changeCount bumps, and helper multi-phase wait must be covered.
let suppressUntilMs = 0;

function poll(): void {
    const cap = captureCurrent();
    if (!cap) return;
    if (Date.now() < suppressUntilMs) {
        lastSignature = cap.sig;
        return;
    }
    if (cap.sig === lastSignature) return;
    lastSignature = cap.sig;
    cap.save();
    onUpdate?.();
}

export function startClipboardWatcher(cb: () => void): void {
    onUpdate = cb;
    // Seed lastSignature with current pasteboard so pre-existing content isn't re-captured.
    const cap = captureCurrent();
    lastSignature = cap?.sig ?? null;

    stopClipboardWatcher();

    // Native changeCount watch via helper (100ms background thread).
    startClipboardWatch(poll);
}

export function stopClipboardWatcher(): void {
    stopClipboardWatch();
}

// Call after app writes clipboard itself (paste-item) so watcher doesn't re-capture.
// Can't set lastSignature synchronously — Swift helper has poll delay, and for
// images helper-decoded bytes (NSImage→PNG) differ from originals → sig mismatch.
// Blanket 800ms suppression. Trade-off: user re-copy within 800ms after paste is missed.
export function markClipboardAsCurrent(): void {
    suppressUntilMs = Date.now() + 800;
}
