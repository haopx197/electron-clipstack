import { app, NativeImage } from "electron";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { v4 as uuid } from "uuid";

let imagesDir: string | null = null;

function getImagesDir(): string {
    if (!imagesDir) {
        imagesDir = join(app.getPath("userData"), "clip-images");
        if (!existsSync(imagesDir)) {
            mkdirSync(imagesDir, { recursive: true });
        }
    }
    return imagesDir;
}

export function saveImage(image: NativeImage): string {
    const dir = getImagesDir();
    const filePath = join(dir, `${uuid()}.png`);
    writeFileSync(filePath, image.toPNG());
    return filePath;
}

// Save raw bytes with original ext. Used for SVG (nativeImage can't parse XML)
// and GIF (nativeImage loads static, drops animation).
export function saveImageBytes(bytes: Buffer, ext: string): string {
    const dir = getImagesDir();
    const filePath = join(dir, `${uuid()}.${ext}`);
    writeFileSync(filePath, bytes);
    return filePath;
}

export function deleteImageFile(path: string): void {
    try {
        if (existsSync(path)) {
            unlinkSync(path);
        }
    } catch {
        // best-effort — ignore
    }
}
