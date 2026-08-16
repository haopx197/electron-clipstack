import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { IPC } from "../shared/ipc";
import { ClipboardItem, SetHotkeyResult, UpdateInstallProgress, UpdateStatus } from "../shared/types";

const clipstack = {
    getItems: (): Promise<ClipboardItem[]> => ipcRenderer.invoke(IPC.ClipboardGetItems),
    pasteItem: (id: string): Promise<void> => ipcRenderer.invoke(IPC.ClipboardPasteItem, id),
    pinItem: (id: string): Promise<ClipboardItem[]> => ipcRenderer.invoke(IPC.ClipboardPinItem, id),
    deleteItem: (id: string): Promise<ClipboardItem[]> => ipcRenderer.invoke(IPC.ClipboardDeleteItem, id),
    clearAll: (): Promise<ClipboardItem[]> => ipcRenderer.invoke(IPC.ClipboardClearAll),
    openItem: (id: string): Promise<void> => ipcRenderer.invoke(IPC.ClipboardOpenItem, id),

    getHotkey: (): Promise<string> => ipcRenderer.invoke(IPC.SettingsGetHotkey),
    setHotkey: (accelerator: string): Promise<SetHotkeyResult> =>
        ipcRenderer.invoke(IPC.SettingsSetHotkey, accelerator),

    getMaxClips: (): Promise<number> => ipcRenderer.invoke(IPC.SettingsGetMaxClips),
    setMaxClips: (n: number): Promise<{ maxClips: number; items: ClipboardItem[] }> =>
        ipcRenderer.invoke(IPC.SettingsSetMaxClips, n),

    getCaptureToClipboard: (): Promise<boolean> =>
        ipcRenderer.invoke(IPC.SettingsGetCaptureToClipboard),
    setCaptureToClipboard: (value: boolean): Promise<boolean> =>
        ipcRenderer.invoke(IPC.SettingsSetCaptureToClipboard, value),

    hideWindow: (): Promise<void> => ipcRenderer.invoke(IPC.WindowHide),

    getAccessibilityStatus: (): Promise<boolean> => ipcRenderer.invoke(IPC.SystemAccessibilityStatus),
    openAccessibilitySettings: (): Promise<void> =>
        ipcRenderer.invoke(IPC.SystemOpenAccessibilitySettings),
    relaunch: (): Promise<void> => ipcRenderer.invoke(IPC.SystemRelaunch),

    getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UpdatesGetStatus),
    installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.UpdatesInstall),
    onUpdateInstallProgress: (cb: (p: UpdateInstallProgress) => void): (() => void) => {
        const listener = (_e: IpcRendererEvent, p: UpdateInstallProgress): void => cb(p);
        ipcRenderer.on(IPC.UpdatesInstallProgress, listener);
        return () => ipcRenderer.removeListener(IPC.UpdatesInstallProgress, listener);
    },

    onItemsUpdated: (cb: (items: ClipboardItem[]) => void): (() => void) => {
        const listener = (_e: IpcRendererEvent, items: ClipboardItem[]): void => cb(items);
        ipcRenderer.on(IPC.ClipboardItemsUpdated, listener);
        return () => ipcRenderer.removeListener(IPC.ClipboardItemsUpdated, listener);
    }
};

export type ClipstackAPI = typeof clipstack;

if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld("clipstack", clipstack);
    } catch (error) {
        console.error(error);
    }
} else {
    // @ts-ignore
    window.clipstack = clipstack;
}
