import { resolve } from "path";
import { execSync } from "child_process";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Short git SHA embedded at build time — used by the updater to compare the
// running build against the `latest.json` published on GitHub Releases. Falls
// back to "dev" outside a git checkout so builds don't fail.
function getBuildSha(): string {
    try {
        return execSync("git rev-parse --short HEAD", {
            stdio: ["ignore", "pipe", "ignore"]
        })
            .toString()
            .trim();
    } catch {
        return "dev";
    }
}

const BUILD_SHA = getBuildSha();

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin({ exclude: ["electron-store"] })],
        define: {
            __BUILD_SHA__: JSON.stringify(BUILD_SHA)
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
});
