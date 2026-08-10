import Store from "electron-store";
import { v4 as uuid } from "uuid";
import { AppSettings, ClipboardItem, ClipboardItemType, DEFAULT_HOTKEY, MAX_UNPINNED_ITEMS } from "../shared/types";
import { deleteImageFile } from "./images";

interface Schema {
    items: ClipboardItem[];
    settings: AppSettings;
}

const store = new Store<Schema>({
    name: "clipstack",
    defaults: {
        items: [],
        settings: { hotkey: DEFAULT_HOTKEY }
    }
});

function readItems(): ClipboardItem[] {
    return store.get("items") as ClipboardItem[];
}

function writeItems(items: ClipboardItem[]): void {
    store.set("items", items);
}

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

export interface NewItemInput {
    type: ClipboardItemType;
    content: string;
    preview?: string;
    bookmarkTitle?: string;
    fileName?: string;
}

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

    if (unpinned.length > MAX_UNPINNED_ITEMS) {
        const kept = unpinned.slice(0, MAX_UNPINNED_ITEMS);
        const dropped = unpinned.slice(MAX_UNPINNED_ITEMS);
        for (const d of dropped) cleanupOwnedFiles(d);
        writeItems([...pinned, ...kept]);
        return sortItems([...pinned, ...kept]);
    }

    writeItems(items);
    return sortItems(items);
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
    const settings = store.get("settings") as AppSettings;
    return settings.hotkey || DEFAULT_HOTKEY;
}

export function setHotkey(hotkey: string): void {
    const settings = store.get("settings") as AppSettings;
    store.set("settings", { ...settings, hotkey });
}
