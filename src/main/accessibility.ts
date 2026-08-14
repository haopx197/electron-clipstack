import { systemPreferences, app } from "electron";

// ClipStack chỉ chạy khi có Accessibility permission. Nếu chưa cấp, trigger
// macOS native prompt (dialog hệ thống "ClipStack would like to control this
// computer..." có button "Open System Settings") rồi quit. User bật xong tự
// mở lại app.
export function ensureAccessibilityPermission(): boolean {
    // prompt=true → macOS bắn native system dialog. Dialog này tồn tại độc lập
    // với process app, vẫn hiển thị sau khi app quit.
    if (systemPreferences.isTrustedAccessibilityClient(true)) return true;
    app.exit(0);
    return false;
}
