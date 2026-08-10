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

/**
 * Lưu bytes ảnh nguyên bản với extension cho trước. Dùng cho SVG (XML text —
 * nativeImage không parse được) và GIF (nativeImage load về static, mất animation).
 * Renderer `<img>` render mọi format browser hỗ trợ.
 */
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
        // best-effort
    }
}
