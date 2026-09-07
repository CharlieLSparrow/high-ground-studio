import Foundation

// Only external account/media DTO boundaries are substituted. The script
// compiles the actual draft store, rich-text composer, persistence, and the
// recording's production voice-writing identity accessor.
enum AuthManager {
    static var ownerAccountID: String? = "writer-a"
    static func currentStoredOwnerID() -> String? { ownerAccountID }
}
enum CaptureLaunchConfiguration { static let usesPreviewData = false }
extension Notification.Name {
    static let quipslyCaptureAccountIdentityDidChange = Notification.Name("qa.account")
}
struct MobileCaptureTag: Codable, Equatable { let label: String }
struct OnDeviceTranscriptSegment {
    let startSeconds: Double
    let endSeconds: Double
    let text: String
}
struct OnDeviceTranscriptSidecar {
    let clientRequestId: UUID
    let sourceSha256: String
    let segments: [OnDeviceTranscriptSegment]
}
struct LocalRecording {
    let id: UUID
    let ownerAccountID: String?
    let isPersonalVoiceNote: Bool
    let callRoomId: String?
    let localDraftCallRoomId: String?
    let sessionTitle: String?
    var displayTitle: String { sessionTitle ?? "Voice recording" }
}

final class TestWritingFileManager: FileManager, @unchecked Sendable {
    let support: URL
    init(support: URL) { self.support = support; super.init() }
    override func urls(for directory: FileManager.SearchPathDirectory, in domainMask: FileManager.SearchPathDomainMask) -> [URL] {
        precondition(directory == .applicationSupportDirectory)
        return [support]
    }
}

@main
struct VoiceWritingContinuationHarness {
    @MainActor static func main() throws {
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("quipsly-writing-continuation-\(UUID())")
        try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temporary) }
        for uploadedFirst in [false, true] {
            let manager = TestWritingFileManager(support: temporary.appendingPathComponent(uploadedFirst ? "uploaded-first" : "transcribed-first"))
            AuthManager.ownerAccountID = "writer-a"
            let store = VoiceWritingDraftStore(fileManager: manager)
            let now = Date(timeIntervalSince1970: 1_800_000_000)
            let blank = try store.createTypedDraft(now: now)
            let before = try store.update(draftID: blank.id, title: "A chapter I am writing", body: "Original paragraph.\n\nClosing thought.", now: now)
            let localRoom = "local-voice-note-\(UUID())"
            try store.stageContinuation(callRoomID: localRoom, draftID: before.id, insertionUtf16: 19)

            // Upload can replace callRoomId before the speech engine finishes.
            // Both completion orders must continue the author's same document.
            let source = LocalRecording(id: UUID(), ownerAccountID: "writer-a", isPersonalVoiceNote: true,
                callRoomId: uploadedFirst ? "canonical-room-after-upload" : localRoom,
                localDraftCallRoomId: uploadedFirst ? localRoom : nil,
                sessionTitle: before.title)
            let transcript = OnDeviceTranscriptSidecar(clientRequestId: UUID(), sourceSha256: String(repeating: "a", count: 64),
                segments: [OnDeviceTranscriptSegment(startSeconds: 0, endSeconds: 3, text: "A new spoken paragraph.")])
            let relaunched = VoiceWritingDraftStore(fileManager: manager)
            AuthManager.ownerAccountID = "writer-b"
            relaunched.activateOwner("writer-b")
            precondition(relaunched.drafts.isEmpty, "Another account must not see this writing")
            precondition(relaunched.seed(from: transcript, recording: source) == nil, "Late speech must not cross accounts")
            AuthManager.ownerAccountID = "writer-a"
            relaunched.activateOwner("writer-a")
            guard let continued = relaunched.seed(from: transcript, recording: source, now: now) else { fatalError("Continuation did not produce writing") }
            precondition(continued.id == before.id, "Upload-before-transcript must not fork a separate writing draft")
            precondition(relaunched.drafts.count == 1, "There must be one document, not disconnected recording and writing")
            precondition(continued.title == before.title, "Keep the author's title")
            precondition(continued.body == "Original paragraph.\n\nA new spoken paragraph.\n\nClosing thought.", "Insert speech where requested without losing existing writing")
            precondition(continued.localRevision == before.localRevision + 1)
            precondition(continued.allSources.count == 1 && continued.allSources[0].localRecordingID == source.id)
            precondition(continued.allSources[0].callRoomID == localRoom)
            precondition(continued.allSources[0].sourceSHA256 == transcript.sourceSha256)
            let repeated = relaunched.seed(from: transcript, recording: source)
            precondition(repeated == continued, "ASR completion replay must not duplicate paragraphs or sources")
            let recovered = VoiceWritingDraftStore(fileManager: manager)
            precondition(recovered.draft(id: before.id) == continued, "Source-linked writing must survive relaunch exactly")
            print("PASS \(uploadedFirst ? "upload before transcription" : "transcription before upload"): one continued document, insertion, account isolation, idempotence, and disk recovery")
        }
    }
}
