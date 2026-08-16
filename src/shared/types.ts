export type ClipboardItemType = "text" | "image" | "bookmark" | "file";

export type ClipboardItem = {
    id: string;
    type: ClipboardItemType;
    /**
     * Primary payload:
     * - text:     raw text content
     * - image:    absolute path to file in userData/clip-images
     * - bookmark: URL
     * - file:     absolute path to user-owned file (not managed by ClipStack)
     */
    content: string;
    /** Plain-text preview for bookmark. */
    preview?: string;
    /** Bookmark title. */
    bookmarkTitle?: string;
    /** Cached basename for type 'file' — used for display. */
    fileName?: string;
    pinned: boolean;
    createdAt: number;
};

export type AppSettings = {
    hotkey: string;
    maxClips: number;
    captureScreenshotsToClipboard: boolean;
};

export type SetHotkeyResult = {
    ok: boolean;
    error?: string;
};

export type UpdateStatus = {
    hasUpdate: boolean;
};

export type UpdateInstallPhase = "idle" | "downloading" | "installing" | "error";

export type UpdateInstallProgress = {
    phase: UpdateInstallPhase;
    /** 0..1 while phase === "downloading". */
    percent: number;
    error: string | null;
};

export const DEFAULT_HOTKEY = "Command+Shift+V";
export const DEFAULT_WINDOW_SIZE = { width: 400, height: 500 };
export const DEFAULT_MAX_CLIPS = 50;
export const DEFAULT_CAPTURE_TO_CLIPBOARD = true;
export const MIN_MAX_CLIPS = 1;
export const MAX_MAX_CLIPS = 200;
