import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("native session refresh preserves navigation on cancellation, not on revoked access", { skip: process.platform !== "darwin" }, t => {
  const directory = mkdtempSync(path.join(tmpdir(), "quipsly-session-refresh-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = readFileSync(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift", import.meta.url), "utf8");
  const clientStart = source.indexOf("final class CaptureSessionClient:");
  const loadStart = source.indexOf("    @discardableResult\n    func load(authoritativeSessionID:", clientStart);
  const loadEnd = source.indexOf("    private func decodeCaptureSessionResponse<", loadStart);
  assert.ok(clientStart >= 0 && loadStart > clientStart && loadEnd > loadStart);
  // Compile the actual production load/error handling, not a duplicate policy.
  // Fixture types replace unrelated upload/document services and network IO.
  const productionMethods = source.slice(loadStart, loadEnd);
  const harness = String.raw`
import Foundation
enum CaptureSessionLoadOutcome: Equatable {
    case loaded, transportUnavailable(message: String), forbidden(message: String)
    case authoritativeAbsent(message: String), invalidResponse(message: String)
}
struct MobileCaptureSession: Decodable {
    let id: String
    let callRoomId: String
    var captureSources: [String]? = nil
}
struct MobileCaptureSessionsResponse: Decodable {
    let ok: Bool
    var error: String? = nil
    var sessions: [MobileCaptureSession]? = nil
    var captureProjects: [String]? = nil
    var coachingEngagements: [String]? = nil
}
@MainActor final class OnDeviceTranscriptManager {
    static let shared = OnDeviceTranscriptManager()
    func reconcileCanonicalTranscriptSources(_ sources: [String]) {}
}
@MainActor final class AuthManager {
    enum Access { case signedIn, signedOut }
    static let shared = AuthManager()
    var accessMode = Access.signedIn
    var hasProtectedOfflineAccess = false
    var suspendCount = 0
    var failure: Error?
    var statusCode = 200
    var payload = #"{"ok":true,"sessions":[{"id":"session","callRoomId":"room"}]}"#
    var continuation: CheckedContinuation<Void, Never>?
    var hold = false
    func authenticatedData(for request: URLRequest, allowOfflineRecovery: Bool) async throws -> (Data, HTTPURLResponse) {
        if hold { await withCheckedContinuation { continuation = $0 } }
        if let failure { throw failure }
        return (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: statusCode, httpVersion: nil, headerFields: nil)!)
    }
    func suspendNetworkActionsForCachedFallback(reason: String) { suspendCount += 1 }
}
@MainActor final class CaptureSessionClient {
    let baseURL = "https://example.test"
    var status = "Ready"
    var errorMessage: String?
    var sessions = [MobileCaptureSession(id: "session", callRoomId: "room")]
    var captureProjects = ["project"]
    var coachingEngagements = ["engagement"]
    var clientFollowUpLoadStates = ["session": "ready"]
    var isUsingCachedSessions = false
    var cachedSessionsSavedAt: Date?
    var lastAuthoritativeLoadAt: Date?
    var cachedSessionStatusLine: String? { nil }
    func restoreProtectedSessionCacheIfAvailable() -> Bool { false }
    func persistProtectedSessionCache() {}
    func refreshClientFollowUp(forSessionID: String) async {}
    PRODUCTION_METHODS
}
@main struct Run {
    @MainActor static func main() async {
        let auth = AuthManager.shared
        for failure: Error in [CancellationError(), URLError(.cancelled)] {
            let client = CaptureSessionClient()
            auth.failure = failure
            let outcome = await client.load(authoritativeSessionID: "session")
            assert(outcome == .transportUnavailable(message: "Session refresh cancelled."))
            assert(client.sessions.first?.id == "session")
            assert(client.captureProjects == ["project"] && client.coachingEngagements == ["engagement"])
            assert(client.status == "Ready" && client.errorMessage == nil)
            assert(!client.isUsingCachedSessions && auth.suspendCount == 0)
        }
        // A transport may return successfully after its owning screen leaves.
        // That response must not replace navigation with an obsolete list.
        auth.failure = nil; auth.hold = true; auth.payload = #"{"ok":true,"sessions":[]}"#
        let client = CaptureSessionClient()
        let pending = Task { await client.load(authoritativeSessionID: "session") }
        while auth.continuation == nil { await Task.yield() }
        pending.cancel(); auth.continuation?.resume(); auth.continuation = nil
        _ = await pending.value
        assert(client.sessions.first?.id == "session" && client.status == "Ready")
        auth.hold = false
        // A genuinely successful empty collection remains authoritative.
        let absent = await client.load(authoritativeSessionID: "session")
        if case .authoritativeAbsent = absent {} else { fatalError("Expected authoritative absence") }
        assert(client.sessions.isEmpty)
        for status in [401, 403] {
            let denied = CaptureSessionClient()
            auth.statusCode = status; auth.payload = #"{"ok":false,"error":"Access revoked"}"#
            let outcome = await denied.load(authoritativeSessionID: "session")
            assert(outcome == .forbidden(message: "Access revoked"))
            assert(denied.sessions.isEmpty && denied.captureProjects.isEmpty)
        }
        auth.accessMode = .signedOut; auth.failure = CancellationError()
        let signedOut = CaptureSessionClient()
        _ = await signedOut.load()
        assert(signedOut.sessions.isEmpty, "Cancellation cannot retain a signed-out account projection")
        print("PASS session navigation cancellation and authority handling")
    }
}
`.replace("PRODUCTION_METHODS", productionMethods);
  const file = path.join(directory, "SessionRefresh.swift"), binary = path.join(directory, "session-refresh");
  writeFileSync(file, harness);
  const compile = spawnSync("xcrun", ["swiftc", "-parse-as-library", file, "-o", binary], { encoding: "utf8", timeout: 60_000 });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const run = spawnSync(binary, [], { encoding: "utf8", timeout: 15_000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /PASS session navigation cancellation/);
});
