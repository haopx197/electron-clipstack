export const IPC = {
    ClipboardGetItems: "clipboard:get-items",
    ClipboardPasteItem: "clipboard:paste-item",
    ClipboardPinItem: "clipboard:pin-item",
    ClipboardDeleteItem: "clipboard:delete-item",
    ClipboardClearAll: "clipboard:clear-all",
    ClipboardOpenItem: "clipboard:open-item",
    ClipboardItemsUpdated: "clipboard:items-updated",
    SettingsGetHotkey: "settings:get-hotkey",
    SettingsSetHotkey: "settings:set-hotkey",
    SettingsGetMaxClips: "settings:get-max-clips",
    SettingsSetMaxClips: "settings:set-max-clips",
    SettingsGetCaptureToClipboard: "settings:get-capture-to-clipboard",
    SettingsSetCaptureToClipboard: "settings:set-capture-to-clipboard",
    WindowHide: "window:hide",
    SystemAccessibilityStatus: "system:accessibility-status",
    SystemOpenAccessibilitySettings: "system:open-accessibility-settings",
    SystemRelaunch: "system:relaunch",
    UpdatesGetStatus: "updates:get-status",
    UpdatesInstall: "updates:install",
    UpdatesInstallProgress: "updates:install-progress"
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
