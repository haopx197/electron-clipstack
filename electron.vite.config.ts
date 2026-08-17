import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Build timestamp embedded via Vite `define` — the updater compares this to
// `latest.json` on GitHub Releases. Fresh Unix-ms timestamp for each production
// build so every rebuild (even at the same commit, with no source changes) is
// a distinct "version" and triggers the "Update available" banner. Dev builds
// use the literal "dev" so the updater short-circuits and never nags.
export default defineConfig(({ command }) => {
    const BUILD_TIMESTAMP = command === "build" ? String(Date.now()) : "dev";
    return {
        main: {
            plugins: [externalizeDepsPlugin({ exclude: ["electron-store"] })],
            define: {
                __BUILD_TIMESTAMP__: JSON.stringify(BUILD_TIMESTAMP)
            },
            resolve: {
                alias: {
                    "@shared": resolve("src/shared")
                }
            }
        },
        preload: {
            plugins: [externalizeDepsPlugin()],
            resolve: {
                alias: {
                    "@shared": resolve("src/shared")
                }
            }
        },
        renderer: {
            resolve: {
                alias: {
                    "@renderer": resolve("src/renderer/src"),
                    "@shared": resolve("src/shared")
                }
            },
            plugins: [react()]
        }
    };
});
