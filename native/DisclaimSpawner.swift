// Tiny launcher shim that spawns its child with TCC responsibility disclaimed.
//
// Why this exists: Node's `child_process.spawn` uses `posix_spawn` under the
// hood, and by default macOS TCC attributes the child's permission requests
// to the *responsible* process — which is the parent that spawned it. For
// ClipStack that means when the Swift helper (`ClipStackHelper.app`,
// `com.clipstack.helper`) calls an Accessibility API, macOS records the TCC
// grant under the *parent* bundle (`com.clipstack.app`) instead of the
// helper's own bundle. The helper's own `AXIsProcessTrusted()` check still
// uses `com.clipstack.helper` though, so granting the parent doesn't actually
// enable paste — the two disagree.
//
// Chrome-family apps solve this by calling the private
// `responsibility_spawnattrs_setdisclaim(attrs, 1)` on the posix_spawn
// attributes right before spawning. That tells TCC "this child is its own
// thing, don't attribute to me." Node doesn't expose this option, so we ship
// a two-line shim that Node spawns instead of the helper directly:
//
//     Node  ─spawn─▶  DisclaimSpawner  ─posix_spawn(disclaim)─▶  ClipStackHelper
//
// stdio inherits straight through, so Node still talks to the helper over
// stdin/stdout as if the shim weren't there.
//
// Usage: DisclaimSpawner <child-exec-path> [child args...]

import Foundation

@_silgen_name("responsibility_spawnattrs_setdisclaim")
func responsibility_spawnattrs_setdisclaim(
    _ attrs: UnsafeMutablePointer<posix_spawnattr_t?>,
    _ disclaim: Int32
) -> Int32

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write(
        "usage: DisclaimSpawner <exec-path> [args...]\n".data(using: .utf8)!
    )
    exit(64) // EX_USAGE
}

let execPath = args[1]
let childArgv: [String] = Array(args.dropFirst()) // argv[0] = execPath by convention

var attrs: posix_spawnattr_t?
posix_spawnattr_init(&attrs)
_ = responsibility_spawnattrs_setdisclaim(&attrs, 1)

// C argv (nil-terminated).
var cArgs: [UnsafeMutablePointer<CChar>?] = childArgv.map { strdup($0) }
cArgs.append(nil)

var pid: pid_t = 0
let rc = posix_spawn(&pid, execPath, nil, &attrs, &cArgs, environ)
posix_spawnattr_destroy(&attrs)
for p in cArgs where p != nil { free(p) }

if rc != 0 {
    FileHandle.standardError.write(
        "DisclaimSpawner: posix_spawn(\(execPath)) failed rc=\(rc)\n".data(using: .utf8)!
    )
    exit(1)
}

// Forward SIGTERM / SIGINT to the child so a `kill` on the shim also stops
// the helper. The parent-watch loop in the helper covers SIGKILL cases.
var childPid = pid
signal(SIGTERM) { _ in exit(143) }
signal(SIGINT) { _ in exit(130) }

var status: Int32 = 0
_ = waitpid(childPid, &status, 0)

// Preserve the child's exit code / signal in our own exit status.
if (status & 0x7f) == 0 {
    exit((status >> 8) & 0xff)
}
exit(128 + (status & 0x7f))
