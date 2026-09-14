import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("native after-call reads shared uploads and rejects revoked, stale and cross-account responses", {skip: process.platform !== "darwin"}, t => {
  const directory = mkdtempSync(path.join(tmpdir(), "quipsly-after-call-client-"));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const production = readFileSync(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureSessionAfterCall.swift", import.meta.url), "utf8");
  const progress = readFileSync(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureTranscriptProgress.swift", import.meta.url), "utf8");
  const harness = String.raw`
import Combine
import Foundation
extension Notification.Name { static let quipslyCaptureAccountIdentityDidChange = Notification.Name("test.account") }
func normalizedNestBaseURL(_ value: String) -> String { value }
@MainActor final class AuthManager {
    static let shared = AuthManager()
    struct Owner { let ownerAccountID: String }
    func stableOwnerSnapshot() -> Owner? { Owner(ownerAccountID: "coach") }
    func authenticatedData(for request: URLRequest, transitionToOfflineOnNetworkFailure: Bool) async throws -> (Data, HTTPURLResponse) { fatalError("Test must inject transport") }
}
@MainActor final class Fixture {
    var owner: String? = "coach"
    var status = 200
    var payloadRoom = "room"
    var uploaded = 2
    var pending = 1
    var requestedURL: URL?
    var wait = false
    var continuation: CheckedContinuation<Void, Never>?
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requestedURL = request.url
        assert(request.cachePolicy == .reloadIgnoringLocalCacheData)
        assert(request.timeoutInterval == 15)
        if wait { await withCheckedContinuation { continuation = $0 } }
        let json: [String: Any] = ["ok": status == 200, "summary": ["roomId": payloadRoom,
            "recordings": ["uploaded": uploaded, "pending": pending, "attention": 0],
            "transcripts": ["available": 1, "processing": 0, "attention": 0], "transcriptSourceId": "phone-source", "recordingSourceId": "phone-source", "otherRecordingCount": 4]]
        return (try JSONSerialization.data(withJSONObject: json), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}
@main struct Run {
    @MainActor static func main() async {
        let upload = CaptureTranscriptProgressSource(recordingAssetId: "upload", participantLabel: "Casey",
            transcriptJobId: nil, status: "WAITING_FOR_UPLOAD", error: nil, failureCode: nil, retryable: false)
        assert(upload.isProcessing && upload.actionTitle == nil)
        assert(upload.title == "Waiting for recording upload")
        assert(upload.detail.contains("recording device"))
        let attention = CaptureTranscriptProgressSource(recordingAssetId: "upload", participantLabel: "Casey",
            transcriptJobId: nil, status: "UPLOAD_ATTENTION", error: nil, failureCode: nil, retryable: false)
        assert(!attention.isProcessing && attention.actionTitle == nil)
        assert(attention.title == "Recording upload needs attention")
        let f = Fixture()
        let client = CaptureSessionAfterCallClient(baseURL: URL(string: "https://example.test")!, ownerID: {f.owner}, transport: {try await f.send($0)})
        let initial = await client.refresh(roomID: "room")
        assert(initial)
        assert(f.requestedURL?.path == "/api/sessions/room/after-call")
        assert(client.currentSummary(for: "room")?.recordings.uploaded == 2)
        assert(client.summary?.transcriptSourceId == "phone-source")
        assert(client.summary?.otherRecordingCount == 4)
        assert(client.summary?.recordingSourceId == "phone-source")
        assert(client.summary?.isProcessing == true)
        assert(client.summary?.focusedTranscriptAssetID == nil, "Pending endpoints still belong to the session transcript")
        let single = CaptureSessionAfterCallSummary(roomId: "room", recordings: .init(uploaded: 1, pending: 0, attention: 0),
            transcripts: .init(available: 1, processing: 0, attention: 0), transcriptSourceId: "phone-source")
        assert(single.focusedTranscriptAssetID == "phone-source")
        let combined = CaptureSessionAfterCallSummary(roomId: "room", recordings: .init(uploaded: 2, pending: 0, attention: 0),
            transcripts: .init(available: 2, processing: 0, attention: 0), transcriptSourceId: "phone-source")
        assert(combined.focusedTranscriptAssetID == nil, "Both participants should open as one session transcript")
        assert(client.currentSummary(for: "another-room") == nil)
        f.owner = "client"
        assert(client.currentSummary(for: "room") == nil, "Changing account hides results synchronously")
        _ = await client.refresh(roomID: "room")
        assert(client.currentSummary(for: "room")?.recordings.uploaded == 2)
        f.status = 404
        let revoked = await client.refresh(roomID: "room")
        assert(!revoked && client.summary == nil && client.errorMessage != nil)
        f.status = 503
        let retryable = await client.refresh(roomID: "room")
        assert(retryable && client.summary == nil)
        f.status = 200; f.payloadRoom = "wrong-room"
        _ = await client.refresh(roomID: "room")
        assert(client.summary == nil)
        f.payloadRoom = "room"; f.uploaded = -1
        _ = await client.refresh(roomID: "room")
        assert(client.summary == nil)
        f.uploaded = 3; f.wait = true
        let old = Task { await client.refresh(roomID: "room") }
        while f.continuation == nil { await Task.yield() }
        f.owner = "another-account"
        f.continuation?.resume(); f.continuation = nil
        let stale = await old.value
        assert(!stale && client.currentSummary(for: "room") == nil)
        f.wait = false
        _ = await client.refresh(roomID: "room")
        assert(client.currentSummary(for: "room")?.recordings.uploaded == 3)
        client.reset()
        assert(client.currentSummary(for: "room") == nil)
        print("PASS native shared after-call transport, identity and recovery")
    }
}
`;
  const file = path.join(directory, "AfterCall.swift"), binary = path.join(directory, "after-call");
  writeFileSync(file, production + "\n" + progress + "\n" + harness);
  const compile = spawnSync("xcrun", ["swiftc", "-parse-as-library", file, "-o", binary], {encoding: "utf8", timeout: 60_000});
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const run = spawnSync(binary, [], {encoding: "utf8", timeout: 15_000});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /PASS native shared after-call/);
});
