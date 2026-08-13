export const IPC = {
    ClipboardGetItems: "clipboard:get-items",
    ClipboardPasteItem: "clipboard:paste-item",
    ClipboardPinItem: "clipboard:pin-item",
    ClipboardDeleteItem: "clipboard:delete-item",
    ClipboardClearAll: "clipboard:clear-all",
    ClipboardItemsUpdated: "clipboard:items-updated",
    SettingsGetHotkey: "settings:get-hotkey",
    SettingsSetHotkey: "settings:set-hotkey",
    SettingsGetMaxClips: "settings:get-max-clips",
    SettingsSetMaxClips: "settings:set-max-clips",
    WindowHide: "window:hide"
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
