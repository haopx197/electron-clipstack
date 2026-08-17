// electron-builder afterPack hook — ad-hoc re-sign the assembled .app.
//
// Why this exists: with CSC_IDENTITY_AUTO_DISCOVERY=false, electron-builder
// skips signing entirely, leaving the ad-hoc signatures the pre-built Electron
// template shipped with. Two problems compound:
//
//   1. Electron Framework and other bundled frameworks (ReactiveObjC,
//      Squirrel, Mantle...) are "linker-signed" and lack CodeResources
//      files. Their signatures declare that resources should be present but
//      the framework layout doesn't have them, so `codesign --verify --deep`
//      and Gatekeeper reject the whole bundle as "code has no resources but
//      signature indicates they must be present". Finder shows the no-entry
//      slash icon on the app.
//   2. Our own `extraFiles` (ClipStackHelper.app + DisclaimSpawner) land in
//      Contents/Frameworks/ AFTER Electron's pre-signed CodeResources was
//      computed, so the parent's signature no longer covers them.
//
// Fix: `--deep --force` ad-hoc re-signs the whole tree from the leaves up.
// It's blessed with the Electron entitlements (JIT, unsigned-executable-memory,
// dyld-env-vars) so V8 keeps working. `--deep` on nested frameworks that
// only ship a binary produces a proper _CodeSignature/CodeResources for
// each, which is what Gatekeeper wants.
//
// Note: the CLAUDE.md warning about `codesign --deep --force` causing
// `task_name_for_pid` failures traces back to running the command WITHOUT
// entitlements. Passing --entitlements keeps V8 and CS_KILL happy.
"use strict";

const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== "darwin") return;

    const app = path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.app`
    );
    const entitlements = path.resolve(context.packager.projectDir, "build/entitlements.mac.plist");

    console.log(`[afterPack] ad-hoc --deep signing ${app}`);
    execFileSync(
        "codesign",
        ["--sign", "-", "--force", "--deep", "--entitlements", entitlements, app],
        { stdio: "inherit" }
    );
};
