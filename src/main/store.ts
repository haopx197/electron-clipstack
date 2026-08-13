import Store from "electron-store";
import { v4 as uuid } from "uuid";
import {
    AppSettings,
    ClipboardItem,
    ClipboardItemType,
    DEFAULT_HOTKEY,
    DEFAULT_MAX_CLIPS,
    MAX_MAX_CLIPS,
    MIN_MAX_CLIPS
} from "../shared/types";
import { deleteImageFile } from "./images";

type Schema = {
    items: ClipboardItem[];
    settings: AppSettings;
};

const store = new Store<Schema>({
    name: "clipstack",
    defaults: {
        items: [],
        settings: { hotkey: DEFAULT_HOTKEY, maxClips: DEFAULT_MAX_CLIPS }
    }
});

function readSettings(): AppSettings {
    const s = store.get("settings") as Partial<AppSettings> | undefined;
    return {
        hotkey: s?.hotkey || DEFAULT_HOTKEY,
        maxClips: clampMaxClips(s?.maxClips ?? DEFAULT_MAX_CLIPS)
    };
}

function clampMaxClips(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_MAX_CLIPS;
    const rounded = Math.floor(n);
    if (rounded < MIN_MAX_CLIPS) return MIN_MAX_CLIPS;
    if (rounded > MAX_MAX_CLIPS) return MAX_MAX_CLIPS;
    return rounded;
}

function readItems(): ClipboardItem[] {
    return store.get("items") as ClipboardItem[];
}

function writeItems(items: ClipboardItem[]): void {
    store.set("items", items);
}

// One-time migration: legacy html/rtf items → text. Chạy lúc module load,
// idempotent — nếu không còn item legacy thì không ghi disk.
(function migrateLegacyRichTypes(): void {
    const items = readItems();
    let dirty = false;
    for (const item of items) {
        const t = item.type as string;
        if (t === "html" || t === "rtf") {
            item.type = "text";
            item.content = (item.preview || item.content).slice(0, 10000);
            item.preview = undefined;
            item.bookmarkTitle = undefined;
            dirty = true;
        }
    }
    if (dirty) writeItems(items);
})();

function sortItems(items: ClipboardItem[]): ClipboardItem[] {
    const pinned = items.filter((i) => i.pinned);
    const unpinned = items.filter((i) => !i.pinned).sort((a, b) => b.createdAt - a.createdAt);
    return [...pinned, ...unpinned];
}

/** Only image items own a file managed by ClipStack — file items point at user files. */
function cleanupOwnedFiles(item: ClipboardItem): void {
    if (item.type === "image") {
        deleteImageFile(item.content);
    }
}

export function getItems(): ClipboardItem[] {
    return sortItems(readItems());
}

export type NewItemInput = {
    type: ClipboardItemType;
    content: string;
    preview?: string;
    bookmarkTitle?: string;
    fileName?: string;
};

export function addItem(input: NewItemInput): ClipboardItem[] {
    const items = readItems();

    const existingIdx = items.findIndex((i) => i.type === input.type && i.content === input.content);

    if (existingIdx !== -1) {
        const existing = items[existingIdx];
        if (existing.pinned) {
            return sortItems(items);
        }
        existing.createdAt = Date.now();
        existing.preview = input.preview ?? existing.preview;
        existing.bookmarkTitle = input.bookmarkTitle ?? existing.bookmarkTitle;
        existing.fileName = input.fileName ?? existing.fileName;
        writeItems(items);
        return sortItems(items);
    }

    const newItem: ClipboardItem = {
        id: uuid(),
        type: input.type,
        content: input.content,
        preview: input.preview,
        bookmarkTitle: input.bookmarkTitle,
        fileName: input.fileName,
        pinned: false,
        createdAt: Date.now()
    };

    items.push(newItem);

    const unpinned = items.filter((i) => !i.pinned).sort((a, b) => b.createdAt - a.createdAt);
    const pinned = items.filter((i) => i.pinned);

    const cap = readSettings().maxClips;
    if (unpinned.length > cap) {
        const kept = unpinned.slice(0, cap);
        const dropped = unpinned.slice(cap);
        for (const d of dropped) cleanupOwnedFiles(d);
        writeItems([...pinned, ...kept]);
        return sortItems([...pinned, ...kept]);
    }

    writeItems(items);
    return sortItems(items);
}

function trimUnpinnedToCap(cap: number): ClipboardItem[] {
    const items = readItems();
    const pinned = items.filter((i) => i.pinned);
    const unpinned = items.filter((i) => !i.pinned).sort((a, b) => b.createdAt - a.createdAt);
    if (unpinned.length <= cap) return sortItems(items);
    const kept = unpinned.slice(0, cap);
    const dropped = unpinned.slice(cap);
    for (const d of dropped) cleanupOwnedFiles(d);
    const next = [...pinned, ...kept];
    writeItems(next);
    return sortItems(next);
}

export function pinItem(id: string): ClipboardItem[] {
    const items = readItems();
    const item = items.find((i) => i.id === id);
    if (item) {
        item.pinned = !item.pinned;
        writeItems(items);
    }
    return sortItems(items);
}

export function deleteItem(id: string): ClipboardItem[] {
    const items = readItems();
    const idx = items.findIndex((i) => i.id === id);
    if (idx !== -1) {
        const [removed] = items.splice(idx, 1);
        cleanupOwnedFiles(removed);
        writeItems(items);
    }
    return sortItems(items);
}

export function clearAll(): ClipboardItem[] {
    const items = readItems();
    const pinned: ClipboardItem[] = [];
    for (const item of items) {
        if (item.pinned) {
            pinned.push(item);
        } else {
            cleanupOwnedFiles(item);
        }
    }
    writeItems(pinned);
    return sortItems(pinned);
}

export function findItem(id: string): ClipboardItem | undefined {
    return readItems().find((i) => i.id === id);
}

export function getHotkey(): string {
    return readSettings().hotkey;
}

export function setHotkey(hotkey: string): void {
    const settings = readSettings();
    store.set("settings", { ...settings, hotkey });
}

export function getMaxClips(): number {
    return readSettings().maxClips;
}

export function setMaxClips(n: number): ClipboardItem[] {
    const cap = clampMaxClips(n);
    const settings = readSettings();
    store.set("settings", { ...settings, maxClips: cap });
    return trimUnpinnedToCap(cap);
}
