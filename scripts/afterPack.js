// electron-builder afterPack hook.
// Disable Electron's EmbeddedAsarIntegrityValidation fuse so unsigned/ad-hoc
// signed builds don't self-exit on launch with:
//   ERROR:codesign_util.cc:79] task_name_for_pid: (os/kern) failure (5)
// Only safe on macOS distributions where we intentionally skip Developer ID.
const path = require("path");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== "darwin") return;

    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(context.appOutDir, `${appName}.app`);

    await flipFuses(appPath, {
        version: FuseVersion.V1,
        [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
        [FuseV1Options.OnlyLoadAppFromAsar]: true,
        resetAdHocDarwinSignature: true,
    });
};
