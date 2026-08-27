import Combine
import Foundation

struct VoiceWritingDraft: Codable, Identifiable, Equatable {
    let id: UUID
    let ownerAccountID: String
    let localRecordingID: UUID
    let sourceTranscriptClientRequestID: UUID
    let sourceSHA256: String
    let callRoomID: String?
    let createdAt: Date
    var title: String
    var body: String
    var updatedAt: Date
    var localRevision: Int
    var serverRevision: Int?
    var canonicalDocumentID: String?
    var lastSyncedAt: Date?
    var lastSyncError: String?

    var isSynced: Bool {
        serverRevision == localRevision && canonicalDocumentID != nil
    }
}

enum VoiceWritingDraftStoreError: LocalizedError {
    case accountIdentityUnavailable
    case draftUnavailable
    case protectedStorageUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Sign in to open this private writing draft."
        case .draftUnavailable:
            "This writing draft is no longer available on this iPhone."
        case .protectedStorageUnavailable:
            "Protected writing storage is unavailable. Quipsly did not claim the draft was saved."
        }
    }
}

/// Private, actor-partitioned working copies generated from immutable timed
/// transcripts. The transcript remains source evidence; this draft is the
/// intentionally editable writing surface. Every edit is committed locally
/// before Quipsly attempts Nest synchronization.
@MainActor
final class VoiceWritingDraftStore: ObservableObject {
    static let shared = VoiceWritingDraftStore()

    @Published private(set) var drafts: [VoiceWritingDraft] = []
    @Published private(set) var persistenceError: String?

    private struct Ledger: Codable {
        let schemaVersion: Int
        let drafts: [VoiceWritingDraft]
    }

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedDrafts: [VoiceWritingDraft] = []
    private var activeOwnerAccountID: String?
    private var accountObserver: NSObjectProtocol?

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        activeOwnerAccountID = Self.normalizedOwnerID(AuthManager.currentStoredOwnerID())
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support", isDirectory: true)
        let directory = support.appendingPathComponent("QuipslyCapture/VoiceWriting", isDirectory: true)
        ledgerURL = directory.appendingPathComponent("voice-writing-v1.json")
        lastKnownGoodURL = directory.appendingPathComponent("voice-writing-v1.last-known-good.json")

        do {
            try fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
            )
            try fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: directory.path
            )
            storedDrafts = try Self.loadLedger(
                fileManager: fileManager,
                primary: ledgerURL,
                fallback: lastKnownGoodURL
            )
            publishActiveDrafts()
        } catch {
            persistenceError = VoiceWritingDraftStoreError.protectedStorageUnavailable.localizedDescription
        }

        accountObserver = NotificationCenter.default.addObserver(
            forName: .quipslyCaptureAccountIdentityDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            MainActor.assumeIsolated {
                self?.activateOwner(notification.object as? String)
            }
        }
    }

    deinit {
        if let accountObserver { NotificationCenter.default.removeObserver(accountObserver) }
    }

    func activateOwner(_ ownerAccountID: String?) {
        activeOwnerAccountID = Self.normalizedOwnerID(ownerAccountID)
        publishActiveDrafts()
    }

    func draft(for recordingID: UUID) -> VoiceWritingDraft? {
        drafts.first { $0.localRecordingID == recordingID }
    }

    @discardableResult
    func seed(
        from transcript: OnDeviceTranscriptSidecar,
        recording: LocalRecording,
        now: Date = Date()
    ) -> VoiceWritingDraft? {
        guard recording.isPersonalVoiceNote,
              let owner = Self.normalizedOwnerID(recording.ownerAccountID),
              owner == Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            return nil
        }
        if let existing = storedDrafts.first(where: {
            $0.ownerAccountID == owner && $0.localRecordingID == recording.id
        }) {
            return existing
        }

        let body = transcript.segments
            .sorted {
                if $0.startSeconds == $1.startSeconds { return $0.endSeconds < $1.endSeconds }
                return $0.startSeconds < $1.startSeconds
            }
            .map(\.text)
            .joined(separator: " ")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return nil }

        let sessionTitle = recording.sessionTitle?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let draft = VoiceWritingDraft(
            id: recording.id,
            ownerAccountID: owner,
            localRecordingID: recording.id,
            sourceTranscriptClientRequestID: transcript.clientRequestId,
            sourceSHA256: transcript.sourceSha256,
            callRoomID: recording.callRoomId?.trimmingCharacters(in: .whitespacesAndNewlines),
            createdAt: now,
            title: sessionTitle.isEmpty ? recording.displayTitle : sessionTitle,
            body: body,
            updatedAt: now,
            localRevision: 1,
            serverRevision: nil,
            canonicalDocumentID: nil,
            lastSyncedAt: nil,
            lastSyncError: nil
        )
        storedDrafts.append(draft)
        commitBestEffort()
        return draft
    }

    @discardableResult
    func update(
        recordingID: UUID,
        title: String,
        body: String,
        now: Date = Date()
    ) throws -> VoiceWritingDraft {
        let owner = try requireActiveOwner()
        guard let index = storedDrafts.firstIndex(where: {
            $0.ownerAccountID == owner && $0.localRecordingID == recordingID
        }) else {
            throw VoiceWritingDraftStoreError.draftUnavailable
        }
        let cleanTitle = title.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedBody = body.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        guard storedDrafts[index].title != cleanTitle || storedDrafts[index].body != normalizedBody else {
            return storedDrafts[index]
        }
        storedDrafts[index].title = cleanTitle.isEmpty ? "Voice note" : String(cleanTitle.prefix(320))
        storedDrafts[index].body = String(normalizedBody.prefix(200_000))
        storedDrafts[index].updatedAt = now
        storedDrafts[index].localRevision += 1
        storedDrafts[index].lastSyncError = nil
        try commit()
        return storedDrafts[index]
    }

    func markSynced(
        recordingID: UUID,
        canonicalDocumentID: String,
        serverRevision: Int,
        syncedLocalRevision: Int,
        at date: Date = Date()
    ) {
        guard let owner = try? requireActiveOwner(),
              let index = storedDrafts.firstIndex(where: {
                  $0.ownerAccountID == owner && $0.localRecordingID == recordingID
              }) else { return }
        storedDrafts[index].canonicalDocumentID = canonicalDocumentID
        storedDrafts[index].serverRevision = min(serverRevision, syncedLocalRevision)
        storedDrafts[index].lastSyncedAt = date
        storedDrafts[index].lastSyncError = nil
        commitBestEffort()
    }

    func markSyncFailed(recordingID: UUID, message: String) {
        guard let owner = try? requireActiveOwner(),
              let index = storedDrafts.firstIndex(where: {
                  $0.ownerAccountID == owner && $0.localRecordingID == recordingID
              }) else { return }
        storedDrafts[index].lastSyncError = message
        commitBestEffort()
    }

    private func requireActiveOwner() throws -> String {
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw VoiceWritingDraftStoreError.accountIdentityUnavailable
        }
        return owner
    }

    private func publishActiveDrafts() {
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID) else {
            drafts = []
            return
        }
        drafts = storedDrafts
            .filter { $0.ownerAccountID == owner }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    private func commitBestEffort() {
        do {
            try commit()
            persistenceError = nil
        } catch {
            persistenceError = VoiceWritingDraftStoreError.protectedStorageUnavailable.localizedDescription
        }
    }

    private func commit() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(Ledger(schemaVersion: 1, drafts: storedDrafts))
        try data.write(to: ledgerURL, options: [.atomic, .completeFileProtectionUnlessOpen])
        try data.write(to: lastKnownGoodURL, options: [.atomic, .completeFileProtectionUnlessOpen])
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: ledgerURL.path
        )
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: lastKnownGoodURL.path
        )
        publishActiveDrafts()
    }

    private static func loadLedger(
        fileManager: FileManager,
        primary: URL,
        fallback: URL
    ) throws -> [VoiceWritingDraft] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        for url in [primary, fallback] where fileManager.fileExists(atPath: url.path) {
            if let data = try? Data(contentsOf: url, options: [.mappedIfSafe]),
               let ledger = try? decoder.decode(Ledger.self, from: data),
               ledger.schemaVersion == 1 {
                return ledger.drafts
            }
        }
        return []
    }

    private static func normalizedOwnerID(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return normalized.isEmpty ? nil : normalized
    }
}

private struct VoiceWritingSyncRequest: Encodable {
    let draftId: String
    let localRecordingId: String
    let transcriptClientRequestId: String
    let sourceSha256: String
    let callRoomId: String?
    let title: String
    let body: String
    let localRevision: Int
    let expectedServerRevision: Int

    init(_ draft: VoiceWritingDraft) {
        draftId = draft.id.uuidString.lowercased()
        localRecordingId = draft.localRecordingID.uuidString.lowercased()
        transcriptClientRequestId = draft.sourceTranscriptClientRequestID.uuidString.lowercased()
        sourceSha256 = draft.sourceSHA256
        callRoomId = draft.callRoomID
        title = draft.title
        body = draft.body
        localRevision = draft.localRevision
        expectedServerRevision = draft.serverRevision ?? 0
    }
}

private struct VoiceWritingSyncResponse: Decodable {
    struct SavedDraft: Decodable {
        let documentId: String
        let localRevision: Int
        let serverRevision: Int
    }

    let ok: Bool
    let code: String?
    let error: String?
    let draft: SavedDraft?
}

/// Debounced local-first synchronization for private writing. Typing never
/// waits on the network: the protected draft is saved first, then the latest
/// revision is sent with an optimistic Nest revision. A collision preserves
/// the complete iPhone copy instead of silently overwriting another edit.
@MainActor
final class VoiceWritingDraftSyncClient: ObservableObject {
    static let shared = VoiceWritingDraftSyncClient()

    @Published private(set) var syncingRecordingIDs: Set<UUID> = []
    private var pendingTasks: [UUID: Task<Void, Never>] = [:]
    private let apiBaseURL = normalizedNestAPIBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )

    private init() {}

    func schedule(_ draft: VoiceWritingDraft, delay: Duration = .milliseconds(650)) {
        pendingTasks[draft.localRecordingID]?.cancel()
        pendingTasks[draft.localRecordingID] = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.syncLatest(recordingID: draft.localRecordingID)
        }
    }

    func syncNow(recordingID: UUID) {
        pendingTasks[recordingID]?.cancel()
        pendingTasks[recordingID] = nil
        Task { [weak self] in await self?.syncLatest(recordingID: recordingID) }
    }

    private func syncLatest(recordingID: UUID) async {
        if syncingRecordingIDs.contains(recordingID) {
            if let latest = VoiceWritingDraftStore.shared.draft(for: recordingID) {
                schedule(latest, delay: .milliseconds(800))
            }
            return
        }
        guard AuthManager.shared.networkActionsAllowed,
              let draft = VoiceWritingDraftStore.shared.draft(for: recordingID),
              !draft.isSynced else { return }
        guard let endpoint = URL(string: "\(apiBaseURL)/api/mobile/capture/voice-writing") else {
            VoiceWritingDraftStore.shared.markSyncFailed(
                recordingID: recordingID,
                message: "Quipsly's private writing address is invalid."
            )
            return
        }

        syncingRecordingIDs.insert(recordingID)
        defer { syncingRecordingIDs.remove(recordingID) }
        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.httpBody = try JSONEncoder().encode(VoiceWritingSyncRequest(draft))
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                expectedOwnerAccountID: draft.ownerAccountID
            )
            let payload = try JSONDecoder().decode(VoiceWritingSyncResponse.self, from: data)
            guard (200...299).contains(response.statusCode),
                  payload.ok,
                  let saved = payload.draft else {
                throw NSError(
                    domain: "QuipslyVoiceWriting",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Writing could not sync yet. Your iPhone draft is safe."]
                )
            }
            VoiceWritingDraftStore.shared.markSynced(
                recordingID: recordingID,
                canonicalDocumentID: saved.documentId,
                serverRevision: saved.serverRevision,
                syncedLocalRevision: saved.localRevision
            )
            if let latest = VoiceWritingDraftStore.shared.draft(for: recordingID),
               !latest.isSynced {
                schedule(latest, delay: .milliseconds(250))
            }
        } catch {
            VoiceWritingDraftStore.shared.markSyncFailed(
                recordingID: recordingID,
                message: error.localizedDescription
            )
        }
    }
}
