// ClipStackHelper — persistent Swift child process for ClipStack (Electron).
// Line-based text protocol over stdin/stdout. Requires Accessibility permission.
//
// Commands (stdin) → responses (stdout):
//   mouse-start        → mouse-start:ok       (+ click:<x>,<y> per outside click)
//   mouse-stop         → mouse-stop:ok
//   pb-watch-start     → pb-watch-start:ok    (+ pb-files:<paths> + clipboard-changed:<n>)
//   pb-watch-stop      → pb-watch-stop:ok
//   paste              → paste:ok             (activate last non-self target, CGEvent Cmd+V)
//   quit               → exit(0)
//
// Events pushed on pasteboard change:
//   pb-files:<path1>\t<path2>\t…   → real POSIX paths (resolved from NSURL — handles
//                                      file-reference URLs /.file/id=<inode> that POSIX
//                                      open() rejects). Empty payload if no files.
//   pb-image:<path>                → PNG bytes decoded from pasteboard (via NSImage,
//                                      catches legacy OSType flavors Chrome/browsers
//                                      write that Electron/pbpaste don't see).
//                                      Empty payload if no image data.
//   clipboard-changed:<n>          → new changeCount (signals Node to re-capture).
// pb-files + pb-image ALWAYS precede clipboard-changed so Node has cache ready on capture.
//
// Paste target app is tracked automatically via NSWorkspace.didActivateApplication —
// no capture command from Node (avoids timing races). Always remembers the last
// app that was active BEFORE ClipStack.
//
// Mouse coords: NSEvent (bottom-left). Node converts to top-left.

import Foundation
import AppKit
import ApplicationServices
import CoreGraphics

// NSApp must be initialised (accessory policy) for NSEvent global monitor
// callbacks to fire. Plain CLI tools have no NSApp → callback silent-fails
// even with Accessibility granted.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)

var globalMouseMonitor: Any? = nil
var clipboardWatchTimer: DispatchSourceTimer? = nil
var lastChangeCount: Int = NSPasteboard.general.changeCount
// Paste target — kept in sync via NSWorkspace notifications. Always the last
// app that became active EXCEPT ClipStack (parent Electron).
var lastNonSelfTargetPid: pid_t = 0

// Init: snapshot current frontmost if not self.
if let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != getppid() {
    lastNonSelfTargetPid = front.processIdentifier
}

// Track every foreign app activation. Ignore parent.
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
// macOS has no clipboard-change notification; NSPasteboard.changeCount is the
// only signal (every native clipboard manager polls it). Reading changeCount
// is ~1µs and skips the CoreText path Electron readHTML/readRTF triggers.

// File URLs from pasteboard via NSURL (auto-resolves file-reference URLs like
// /.file/id=<inode> to real POSIX paths). Emit tab-separated. Always emit —
// even empty — so Node clears stale cache from previous copy.
func emitPasteboardFiles() {
    let opts: [NSPasteboard.ReadingOptionKey: Any] = [.urlReadingFileURLsOnly: true]
    let objs = NSPasteboard.general.readObjects(forClasses: [NSURL.self], options: opts) ?? []
    let paths = objs.compactMap { ($0 as? URL)?.path }
    send("pb-files:" + paths.joined(separator: "\t"))
}

// Read image from pasteboard, dump PNG to temp file, emit path.
//
// Why: Chrome (and many rich-content apps) write images to NSPasteboard using
// "legacy OSType flavors" (`PNGf`/`8BPS`/`JPEG`/`GIF`…) instead of declaring
// UTIs (`public.png`/`public.tiff`). Result:
//   • `pbpaste -Prefer public.tiff` returns 0 bytes
//   • Electron `clipboard.readImage()` returns empty
//   • Preview.app paste still works — because NSImage(pasteboard:) understands OSType.
// → Helper reads via NSImage, re-encodes as PNG, ships path to Node.
//
// Cleanup: delete previous temp file whenever we write a new one. No exhaustive
// quit-time cleanup — NSTemporaryDirectory is auto-purged by the OS.
var currentTempImagePath: String? = nil

func emitPasteboardImage() {
    if let prev = currentTempImagePath {
        try? FileManager.default.removeItem(atPath: prev)
        currentTempImagePath = nil
    }
    let pb = NSPasteboard.general
    var pngData: Data? = nil
    // Prefer raw PNG bytes when available (skip re-encode).
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

// Chrome/browser copies (especially from Facebook) use a MULTI-PHASE pattern:
//   • bump `changeCount` (implicit clearContents)
//   • declareTypes pass 1 → text/html only
//   • declareTypes pass 2 (100–200ms later) → adds public.png/public.tiff
// Each declareTypes can bump changeCount → if Node captures on pass 1 it adds
// a text item; pass 2 adds an image item → user sees 2 items for one copy.
//
// Wait strategy:
//   1. Wait for types to become non-empty (max 500ms). Non-browsers finish here.
//   2. If browser detected (org.chromium.* type) but no image types yet, wait
//      up to 200ms more for the image phase. Image arrives → coalesce into one
//      emit. 200ms elapses text-only → it's a real text copy; just emit.
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
    // Emit current state immediately so Node has cache at startup.
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
            // Wait for Chrome/FB to finish multi-phase write (no-op when types
            // are already set or the source is not a browser).
            waitForPasteboardReady()
            // Update lastChangeCount to the value AFTER the wait — Chrome may
            // bump it further in declareTypes phase 2 → avoid re-firing next tick.
            let after = NSPasteboard.general.changeCount
            lastChangeCount = after
            // pb-files + pb-image BEFORE clipboard-changed — Node needs cache
            // in place when it captures.
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

// Activate target app + wait until it's actually active (isActive == true, key
// window set + ready to receive keystrokes). Deterministic: poll 2ms, hard
// stop 300ms. No arbitrary grace sleep afterwards.
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

// Post Cmd-down / V-down / V-up / Cmd-up explicitly. Setting .maskCommand on V
// alone is not robust — several apps (Chromium/Electron) verify the physical
// modifier key-down/key-up sequence.
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

// Observe TCC accessibility changes and forward to Electron over stdout. We
// subscribe HERE (in the helper) rather than in the Electron main process so
// nothing in `com.clipstack.app` touches AX at all — that keeps the .app
// bundle from being registered as an AX-eligible client and appearing in
// System Settings alongside the real helper entry.
DistributedNotificationCenter.default().addObserver(
    forName: NSNotification.Name("com.apple.accessibility.api"),
    object: nil,
    queue: OperationQueue.main
) { _ in
    send("ax-changed")
}

// Watch parent process — if the parent (Electron) dies for any reason
// (including SIGKILL), the helper exits so we don't turn into a zombie orphan.
let initialParentPid = getppid()
DispatchQueue.global(qos: .background).async {
    while true {
        sleep(2)
        // getppid() returns 1 (launchd) when the original parent is gone → orphaned.
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
                // Skip CGEvent entirely if untrusted — macOS otherwise raises
                // the "ClipStackHelper wants to control your computer" modal
                // on every failed paste, which is intrusive. The banner is
                // already telling the user AX is missing; there's only one
                // sanctioned path to grant (banner's Open Settings button).
                if !AXIsProcessTrusted() {
                    send("paste:untrusted")
                    return
                }
                // BG queue so we don't block main; wait + CGEvent are thread-safe.
                // restoreTargetAndWait waits for isActive == true → deterministic,
                // no arbitrary grace sleep needed.
                DispatchQueue.global(qos: .userInitiated).async {
                    restoreTargetAndWait()
                    simulatePasteCmdV()
                    DispatchQueue.main.async { send("paste:ok") }
                }
            case "prompt-ax":
                // Trigger macOS's native "grant Accessibility" modal, which
                // has an "Open System Settings" button. This is what the
                // banner's Open Settings button now invokes.
                let options: NSDictionary = [
                    kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true
                ]
                _ = AXIsProcessTrustedWithOptions(options)
                send("prompt-ax:ok")
            case "ax-status":
                // AXIsProcessTrusted() caches per-process, but the helper is
                // spawned fresh whenever the main app restarts, so its value
                // is always current w.r.t. this helper's lifetime.
                send("ax-status:\(AXIsProcessTrusted() ? "true" : "false")")
            case "quit":
                exit(0)
            default:
                send("error:unknown-command:\(line)")
            }
        }
    }
    DispatchQueue.main.async { exit(0) }
}

// NSApp.run() — spin the real AppKit event loop so NSEvent global monitor delivers.
app.run()
