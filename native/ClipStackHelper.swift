// ClipStackHelper — persistent Swift child process for ClipStack (Electron).
// Line-based text protocol qua stdin/stdout. Cần Accessibility permission.
//
// Commands (stdin) → responses (stdout):
//   mouse-start        → mouse-start:ok       (+ click:<x>,<y> mỗi click bên ngoài)
//   mouse-stop         → mouse-stop:ok
//   pb-watch-start     → pb-watch-start:ok    (+ pb-files:<paths> + clipboard-changed:<n>)
//   pb-watch-stop      → pb-watch-stop:ok
//   paste              → paste:ok             (activate last non-self target, CGEvent Cmd+V)
//   quit               → exit(0)
//
// Events pushed khi pasteboard đổi:
//   pb-files:<path1>\t<path2>\t…   → real POSIX paths (resolved từ NSURL — bắt được
//                                      file-reference URL /.file/id=<inode> mà POSIX
//                                      open() từ chối). Empty payload nếu không có file.
//   pb-image:<path>                → PNG bytes decoded từ pasteboard (đọc qua NSImage,
//                                      bắt cả legacy OSType flavors mà Chrome/browser
//                                      ghi mà Electron/pbpaste không nhìn thấy được).
//                                      Empty payload nếu không có image data.
//   clipboard-changed:<n>          → change count mới (báo Node re-capture).
// pb-files + pb-image LUÔN đứng TRƯỚC clipboard-changed để Node có cache sẵn khi capture.
//
// Target app để paste được track TỰ ĐỘNG qua NSWorkspace.didActivateApplication
// notification — không cần Node gửi capture command (tránh timing race). App
// cuối cùng active TRƯỚC ClipStack luôn được nhớ.
//
// Mouse toạ độ: NSEvent (bottom-left). Node convert sang top-left.

import Foundation
import AppKit
import ApplicationServices
import CoreGraphics

// NSApp phải được init (accessory policy) để NSEvent global monitor callback
// nhận events. CLI tool mặc định không có NSApp, callback silent fail dù đã
// cấp Accessibility.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)

var globalMouseMonitor: Any? = nil
var clipboardWatchTimer: DispatchSourceTimer? = nil
var lastChangeCount: Int = NSPasteboard.general.changeCount
// App target để paste vào — được cập nhật liên tục qua NSWorkspace notification.
// Luôn là app cuối cùng active mà KHÔNG phải ClipStack (parent Electron).
var lastNonSelfTargetPid: pid_t = 0

// Init: snapshot frontmost hiện tại nếu không phải chính mình.
if let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != getppid() {
    lastNonSelfTargetPid = front.processIdentifier
}

// Subscribe app-activation events. Callback fire mỗi khi có app khác active,
// track PID nếu không phải parent.
NSWorkspace.shared.notificationCenter.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification,
    object: nil,
    queue: nil
) { note in
    guard let ui = note.userInfo,
          let app = ui[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else {
        return
    }
    if app.processIdentifier != getppid() {
        lastNonSelfTargetPid = app.processIdentifier
    }
}

func logErr(_ s: String) {
    FileHandle.standardError.write(("[helper] " + s + "\n").data(using: .utf8) ?? Data())
}

func send(_ line: String) {
    print(line)
    fflush(stdout)
}

// ---- Global mouse monitor --------------------------------------------------

func startMouseMonitor() {
    if globalMouseMonitor != nil { return }
    let mask: NSEvent.EventTypeMask = [.leftMouseDown, .rightMouseDown, .otherMouseDown]
    let m = NSEvent.addGlobalMonitorForEvents(matching: mask) { _ in
        let p = NSEvent.mouseLocation
        send("click:\(p.x),\(p.y)")
    }
    if m == nil {
        logErr("startMouseMonitor: addGlobalMonitorForEvents returned nil")
    }
    globalMouseMonitor = m
}

func stopMouseMonitor() {
    if let m = globalMouseMonitor {
        NSEvent.removeMonitor(m)
        globalMouseMonitor = nil
    }
}

// ---- Clipboard change watch ------------------------------------------------
// macOS không có notification cho clipboard changes; NSPasteboard.changeCount
// là cách duy nhất (mọi clipboard manager native đều poll). Read changeCount
// cực rẻ (~1µs), không đụng CoreText path như Electron readHTML/readRTF.

// Đọc file URLs trên pasteboard qua NSURL (auto-resolve file-reference URL
// dạng /.file/id=<inode> về POSIX path thật). Emit tab-separated. Luôn emit
// kể cả khi rỗng để Node clear cache stale từ copy trước.
func emitPasteboardFiles() {
    let opts: [NSPasteboard.ReadingOptionKey: Any] = [.urlReadingFileURLsOnly: true]
    let objs = NSPasteboard.general.readObjects(forClasses: [NSURL.self], options: opts) ?? []
    let paths = objs.compactMap { ($0 as? URL)?.path }
    send("pb-files:" + paths.joined(separator: "\t"))
}

// Đọc image trên pasteboard, dump PNG ra temp file, emit path.
//
// Vì sao cần: Chrome (và nhiều app rich-content khác) ghi image bằng NSPasteboard
// dùng "legacy OSType flavors" (`PNGf`/`8BPS`/`JPEG`/`GIF`…) chứ không declare UTI
// (`public.png`/`public.tiff`). Result:
//   • `pbpaste -Prefer public.tiff` trả 0 bytes
//   • Electron `clipboard.readImage()` trả empty
//   • Nhưng Preview.app paste vào ra ảnh — vì NSImage(pasteboard:) hiểu OSType.
// → helper đọc qua NSImage, convert sang PNG rồi ship cho Node.
//
// Cleanup: xoá temp file của lần trước mỗi khi ghi mới. Không cleanup exhaustive
// khi quit — NSTemporaryDirectory được OS auto-purge.
var currentTempImagePath: String? = nil

func emitPasteboardImage() {
    // Cleanup lần trước (best-effort).
    if let prev = currentTempImagePath {
        try? FileManager.default.removeItem(atPath: prev)
        currentTempImagePath = nil
    }
    let pb = NSPasteboard.general
    var pngData: Data? = nil
    // Ưu tiên PNG bytes raw nếu có (khỏi re-encode).
    if let png = pb.data(forType: .png) {
        pngData = png
    } else if let objs = pb.readObjects(forClasses: [NSImage.self], options: nil) as? [NSImage],
              let img = objs.first,
              let tiff = img.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff) {
        pngData = rep.representation(using: .png, properties: [:])
    }
    guard let data = pngData, !data.isEmpty else {
        send("pb-image:")
        return
    }
    let path = NSTemporaryDirectory() + "clipstack-pb-\(UUID().uuidString).png"
    do {
        try data.write(to: URL(fileURLWithPath: path))
        currentTempImagePath = path
        send("pb-image:\(path)")
    } catch {
        send("pb-image:")
    }
}

// Chrome/browser (đặc biệt copy từ Facebook) có pattern MULTI-PHASE:
//   • bump `changeCount` (clearContents ngầm)
//   • declareTypes lần 1 → chỉ có text/html
//   • declareTypes lần 2 (100–200ms sau) → thêm public.png/public.tiff
// Mỗi declareTypes có thể bump changeCount → nếu Node capture ngay lần 1 sẽ
// add text item; lần 2 add image item → user thấy 2 items cho 1 copy.
//
// Wait strategy:
//   1. Chờ types non-empty (max 500ms). Non-browser xong ở đây.
//   2. Nếu detect browser (org.chromium.* type) và chưa có image types, chờ
//      thêm max 200ms cho image phase. Nếu image xuất hiện → gộp 1 emit.
//      Nếu hết 200ms vẫn text-only → là text copy thật, emit thôi.
private let browserPrefixes = ["org.chromium.", "com.apple.WebKit.", "com.microsoft.Edge."]
private let imageUtis = ["public.png", "public.tiff", "public.jpeg", "public.image"]

func waitForPasteboardReady(phase1Ms: Int = 500, phase2Ms: Int = 200, pollMs: Int = 25) {
    let pb = NSPasteboard.general
    let d1 = Date().addingTimeInterval(TimeInterval(phase1Ms) / 1000.0)
    while Date() < d1 {
        if let t = pb.types, !t.isEmpty { break }
        usleep(UInt32(pollMs * 1000))
    }
    guard let initial = pb.types, !initial.isEmpty else { return }
    let isBrowser = initial.contains { t in
        browserPrefixes.contains(where: { t.rawValue.hasPrefix($0) })
    }
    if !isBrowser { return }
    func hasImage() -> Bool {
        guard let ts = pb.types else { return false }
        return ts.contains { t in imageUtis.contains(t.rawValue) }
    }
    if hasImage() { return }
    let d2 = Date().addingTimeInterval(TimeInterval(phase2Ms) / 1000.0)
    while Date() < d2 {
        usleep(UInt32(pollMs * 1000))
        if hasImage() { return }
    }
}

func startClipboardWatch(intervalMs: Int = 100) {
    if clipboardWatchTimer != nil { return }
    // Emit trạng thái hiện tại ngay để Node có cache khi startup.
    emitPasteboardFiles()
    emitPasteboardImage()
    let q = DispatchQueue(label: "clipstack.helper.pbwatch", qos: .utility)
    let t = DispatchSource.makeTimerSource(queue: q)
    t.schedule(deadline: .now() + .milliseconds(intervalMs),
               repeating: .milliseconds(intervalMs),
               leeway: .milliseconds(20))
    t.setEventHandler {
        let cur = NSPasteboard.general.changeCount
        if cur != lastChangeCount {
            // Chờ Chrome/FB finish multi-phase write (no-op nếu types đã sẵn
            // và không phải browser).
            waitForPasteboardReady()
            // Update lastChangeCount về giá trị SAU wait — Chrome có thể bump
            // thêm khi declareTypes phase 2 → tránh re-fire ở tick kế.
            let after = NSPasteboard.general.changeCount
            lastChangeCount = after
            // pb-files + pb-image TRƯỚC clipboard-changed — Node cần cache sẵn khi capture.
            emitPasteboardFiles()
            emitPasteboardImage()
            send("clipboard-changed:\(after)")
        }
    }
    t.resume()
    clipboardWatchTimer = t
}

func stopClipboardWatch() {
    clipboardWatchTimer?.cancel()
    clipboardWatchTimer = nil
}

// ---- Paste (CGEvent Cmd+V) -------------------------------------------------

// Activate target app + chờ đến khi nó thực sự active (isActive == true, đảm
// bảo key window đã set + sẵn sàng nhận keystroke). Deterministic: poll 2ms
// hardstop 300ms. Không cần "grace" arbitrary sau đó.
func restoreTargetAndWait(timeoutSec: TimeInterval = 0.3) {
    if lastNonSelfTargetPid == 0 { return }
    guard let target = NSRunningApplication(processIdentifier: lastNonSelfTargetPid) else { return }
    target.activate(options: [])
    let deadline = Date().addingTimeInterval(timeoutSec)
    while Date() < deadline {
        if target.isActive { return }
        usleep(2_000)
    }
}

// Post rõ ràng Cmd-down / V-down / V-up / Cmd-up. Chỉ set .maskCommand trên V
// không robust — nhiều app (Chromium/Electron) verify physical modifier sequence.
func simulatePasteCmdV() {
    let src = CGEventSource(stateID: .combinedSessionState)
    let cmdKey: CGKeyCode = 55
    let vKey: CGKeyCode = 9

    let cmdDown = CGEvent(keyboardEventSource: src, virtualKey: cmdKey, keyDown: true)
    let vDown = CGEvent(keyboardEventSource: src, virtualKey: vKey, keyDown: true)
    vDown?.flags = .maskCommand
    let vUp = CGEvent(keyboardEventSource: src, virtualKey: vKey, keyDown: false)
    vUp?.flags = .maskCommand
    let cmdUp = CGEvent(keyboardEventSource: src, virtualKey: cmdKey, keyDown: false)

    cmdDown?.post(tap: .cghidEventTap)
    vDown?.post(tap: .cghidEventTap)
    vUp?.post(tap: .cghidEventTap)
    cmdUp?.post(tap: .cghidEventTap)
}

// ---- Stdin command loop ----------------------------------------------------

logErr("accessibility trusted: \(AXIsProcessTrusted())")

// Watch parent process — nếu parent (Electron) chết vì bất kỳ lý do gì
// (bao gồm SIGKILL), helper tự exit để không thành zombie orphan.
let initialParentPid = getppid()
DispatchQueue.global(qos: .background).async {
    while true {
        sleep(2)
        // getppid() trả 1 (launchd) khi parent gốc đã chết → orphaned.
        if getppid() != initialParentPid {
            exit(0)
        }
    }
}

let stdinQueue = DispatchQueue(label: "clipstack.helper.stdin")
stdinQueue.async {
    while let line = readLine() {
        DispatchQueue.main.async {
            switch line {
            case "mouse-start":
                startMouseMonitor()
                send("mouse-start:ok")
            case "mouse-stop":
                stopMouseMonitor()
                send("mouse-stop:ok")
            case "pb-watch-start":
                startClipboardWatch()
                send("pb-watch-start:ok")
            case "pb-watch-stop":
                stopClipboardWatch()
                send("pb-watch-stop:ok")
            case "paste":
                // BG queue để không block main; wait + CGEvent thread-safe.
                // restoreTargetAndWait chờ isActive == true → deterministic,
                // không cần grace sleep sau đó.
                DispatchQueue.global(qos: .userInitiated).async {
                    restoreTargetAndWait()
                    simulatePasteCmdV()
                    DispatchQueue.main.async { send("paste:ok") }
                }
            case "quit":
                exit(0)
            default:
                send("error:unknown-command:\(line)")
            }
        }
    }
    DispatchQueue.main.async { exit(0) }
}

// NSApp.run() — spin đúng AppKit event loop để NSEvent global monitor deliver.
app.run()
