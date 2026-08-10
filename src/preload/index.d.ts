import type { ClipstackAPI } from "./index";

declare global {
    interface Window {
        clipstack: ClipstackAPI;
    }
}

export {};
