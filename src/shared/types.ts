export type ClipboardItemType = "text" | "image" | "html" | "rtf" | "bookmark" | "file";

export interface ClipboardItem {
    id: string;
    type: ClipboardItemType;
    /**
     * Primary payload:
     * - text:     the raw text
     * - image:    absolute path to the PNG file inside userData/clip-images
     * - html:     the HTML source string
     * - rtf:      the RTF source string
     * - bookmark: the URL
     * - file:     the absolute path to the copied file (owned by the user, not by ClipStack)
     */
    content: string;
    /** Plain-text preview for rich types (html / rtf / bookmark). */
    preview?: string;
    /** Title of a bookmark. */
    bookmarkTitle?: string;
    /** File name (basename) for the 'file' type — cached for display. */
    fileName?: string;
    pinned: boolean;
    createdAt: number;
}

export interface AppSettings {
    hotkey: string;
    maxClips: number;
}

export interface SetHotkeyResult {
    ok: boolean;
    error?: string;
}

export const DEFAULT_HOTKEY = "Command+Shift+V";
export const DEFAULT_WINDOW_SIZE = { width: 400, height: 500 };
export const DEFAULT_MAX_CLIPS = 50;
export const MIN_MAX_CLIPS = 1;
export const MAX_MAX_CLIPS = 200;
