import Foundation

// The real store and HTTP adapter are compiled together. Only authentication
// transport and the external media DTOs are substituted. Deliberately deliver
// old responses after sign-out to prove the client's own presentation boundary.
@MainActor final class AuthManager {
    static let shared = AuthManager()
    static var ownerAccountID: String? = "writer-a"
    static func currentStoredOwnerID() -> String? { ownerAccountID }
    var networkActionsAllowed = true
    var requests: [CheckedContinuation<(Data, HTTPURLResponse), Error>] = []

    func authenticatedData(for request: URLRequest, expectedOwnerAccountID: String? = nil) async throws -> (Data, HTTPURLResponse) {
        try await withCheckedThrowingContinuation { requests.append($0) }
    }

    func succeed(_ json: String, at index: Int = 0) {
        requests.remove(at: index).resume(returning: (
            Data(json.utf8), HTTPURLResponse(url: URL(string: "https://nest.example.test")!,
                statusCode: 200, httpVersion: nil, headerFields: nil)!
        ))
    }

    func fail(at index: Int = 0) {
        requests.remove(at: index).resume(throwing: NSError(domain: "OldAccount", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Writer A's old request failed"]))
    }

    static func switchTo(_ owner: String?) {
        ownerAccountID = owner
        NotificationCenter.default.post(name: .quipslyCaptureAccountIdentityDidChange, object: owner)
    }
}

enum CaptureLaunchConfiguration { static let usesPreviewData = false }
extension Notification.Name {
    static let quipslyCaptureAccountIdentityDidChange = Notification.Name("qa.account")
}
func normalizedNestBaseURL(_ value: String) -> String { value }
struct MobileCaptureTag: Codable, Equatable { let label: String; let isActive: Bool? }
struct OnDeviceTranscriptSegment { let startSeconds: Double; let endSeconds: Double; let text: String }
struct OnDeviceTranscriptSidecar {
    let clientRequestId: UUID
    let sourceSha256: String
    let segments: [OnDeviceTranscriptSegment]
}
struct LocalRecording {
    let id: UUID
    let ownerAccountID: String?
    let isPersonalVoiceNote: Bool
    let voiceWritingCallRoomId: String?
    let sessionTitle: String?
    var displayTitle: String { sessionTitle ?? "Voice recording" }
}

final class AccountContextFileManager: FileManager, @unchecked Sendable {
    let support: URL
    init(support: URL) { self.support = support; super.init() }
    override func urls(for directory: FileManager.SearchPathDirectory, in domainMask: FileManager.SearchPathDomainMask) -> [URL] {
        precondition(directory == .applicationSupportDirectory)
        return [support]
    }
}

@main struct VoiceWritingAccountContextHarness {
    @MainActor static func waitForRequests(_ count: Int) async {
        for _ in 0..<1000 {
            if AuthManager.shared.requests.count == count { return }
            try? await Task.sleep(for: .milliseconds(1))
        }
        preconditionFailure("Expected \(count) requests, got \(AuthManager.shared.requests.count)")
    }

    static func context(_ name: String) -> String {
        """
        {"ok":true,"drafts":[],"homeProject":{"id":"\(name)","name":"\(name)","slug":"\(name)"},
        "availableTags":[{"label":"\(name) tag","isActive":true}],
        "destinations":[{"id":"\(name)","name":"\(name)","slug":"\(name)","role":"OWNER","isHome":true}]}
        """
    }

    @MainActor static func main() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("quipsly-writing-accounts-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = VoiceWritingDraftStore(fileManager: AccountContextFileManager(support: directory))
        let client = VoiceWritingDraftSyncClient(store: store)

        let initial = Task { await client.refreshFromNest() }
        await waitForRequests(1)
        AuthManager.shared.succeed(context("writer-a"))
        await initial.value
        precondition(client.homeProject?.name == "writer-a")
        precondition(client.availableTags.count == 1 && client.destinations.count == 1)

        AuthManager.switchTo(nil)
        precondition(client.homeProject == nil && client.availableTags.isEmpty && client.destinations.isEmpty,
            "Account metadata must clear synchronously, not on a later task")
        precondition(client.remoteTranscriptsByRequestID.isEmpty && client.transcriptRefreshErrors.isEmpty)
        print("PASS sign-out immediately clears writing context")

        AuthManager.switchTo("writer-a")
        let old = Task { await client.refreshFromNest() }
        await waitForRequests(1)
        AuthManager.switchTo("writer-b")
        precondition(!client.isRefreshing, "Writer B must not wait for Writer A's network request")
        let current = Task { await client.refreshFromNest() }
        await waitForRequests(2)
        AuthManager.shared.succeed(context("writer-a"))
        await old.value
        precondition(client.homeProject == nil && client.isRefreshing,
            "An old completion must neither repopulate private context nor clear the new loading state")
        AuthManager.shared.succeed(context("writer-b"))
        await current.value
        precondition(client.homeProject?.name == "writer-b" && !client.isRefreshing)
        print("PASS delayed success cannot cross accounts or end another request")

        let oldFailure = Task { await client.refreshFromNest() }
        await waitForRequests(1)
        AuthManager.switchTo(nil)
        AuthManager.switchTo("writer-b")
        let newLogin = Task { await client.refreshFromNest() }
        await waitForRequests(2)
        AuthManager.shared.fail()
        await oldFailure.value
        precondition(client.refreshError == nil && client.isRefreshing,
            "A previous login's failure must not appear in a new login, even for the same owner")
        AuthManager.shared.succeed(context("writer-b-new-login"))
        await newLogin.value
        precondition(client.homeProject?.name == "writer-b-new-login")
        print("PASS delayed failure cannot cross login generations")

        let draft = try store.createTypedDraft()
        let edited = try store.update(draftID: draft.id, title: "Private unsynced thought", body: "Keep this after sign-out.")
        client.schedule(edited, delay: .milliseconds(20))
        AuthManager.switchTo("writer-c")
        try await Task.sleep(for: .milliseconds(40))
        precondition(AuthManager.shared.requests.isEmpty && store.drafts.isEmpty,
            "An old account's queued save must not run in the new account")
        AuthManager.switchTo("writer-b")
        precondition(store.draft(id: draft.id)?.body == "Keep this after sign-out.")
        let restored = VoiceWritingDraftStore(fileManager: AccountContextFileManager(support: directory))
        precondition(restored.draft(id: draft.id)?.body == "Keep this after sign-out.",
            "Clearing presentation state must preserve the actual protected draft on disk")
        print("PASS queued save cancels while account-owned writing survives relaunch")

        client.syncNow(draftID: draft.id)
        await waitForRequests(1)
        precondition(client.syncingDraftIDs.contains(draft.id))
        AuthManager.switchTo(nil)
        AuthManager.switchTo("writer-b")
        client.syncNow(draftID: draft.id)
        await waitForRequests(2)
        AuthManager.shared.fail()
        // The callback resumes on the main actor; give it an explicit turn
        // before checking that the new request remains independent.
        try await Task.sleep(for: .milliseconds(10))
        precondition(client.syncingDraftIDs.contains(draft.id),
            "A late save completion must not end a new login's save of the same draft")
        precondition(store.draft(id: draft.id)?.lastSyncError == nil,
            "A previous login's save failure must not overwrite current draft status")
        AuthManager.shared.fail()
        for _ in 0..<1000 where client.syncingDraftIDs.contains(draft.id) {
            try await Task.sleep(for: .milliseconds(1))
        }
        precondition(!client.syncingDraftIDs.contains(draft.id))
        precondition(store.draft(id: draft.id)?.lastSyncError != nil,
            "A current-account save failure still needs to be shown and retained")
        print("PASS late save cannot alter a new save; current failures remain visible")
    }
}
