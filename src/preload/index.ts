import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { IPC } from "../shared/ipc";
import { ClipboardItem, SetHotkeyResult } from "../shared/types";

const clipstack = {
    getItems: (): Promise<ClipboardItem[]> => ipcRenderer.invoke(IPC.ClipboardGetItems),
    pasteItem: (id: string): Promise<void> => ipcRenderer.invoke(IPC.ClipboardPasteItem, id),
    pinItem: (id: string): Promise<ClipboardItem[]> => ipcRenderer.invoke(IPC.ClipboardPinItem, id),
    deleteItem: (id: string): Promise<ClipboardItem[]> => ipcRenderer.invoke(IPC.ClipboardDeleteItem, id),
    clearAll: (): Promise<ClipboardItem[]> => ipcRenderer.invoke(IPC.ClipboardClearAll),

    getHotkey: (): Promise<string> => ipcRenderer.invoke(IPC.SettingsGetHotkey),
    setHotkey: (accelerator: string): Promise<SetHotkeyResult> =>
        ipcRenderer.invoke(IPC.SettingsSetHotkey, accelerator),

    getMaxClips: (): Promise<number> => ipcRenderer.invoke(IPC.SettingsGetMaxClips),
    setMaxClips: (n: number): Promise<{ maxClips: number; items: ClipboardItem[] }> =>
        ipcRenderer.invoke(IPC.SettingsSetMaxClips, n),

    hideWindow: (): Promise<void> => ipcRenderer.invoke(IPC.WindowHide),

    getAccessibilityStatus: (): Promise<boolean> => ipcRenderer.invoke(IPC.SystemAccessibilityStatus),
    openAccessibilitySettings: (): Promise<void> =>
        ipcRenderer.invoke(IPC.SystemOpenAccessibilitySettings),
    relaunch: (): Promise<void> => ipcRenderer.invoke(IPC.SystemRelaunch),

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
