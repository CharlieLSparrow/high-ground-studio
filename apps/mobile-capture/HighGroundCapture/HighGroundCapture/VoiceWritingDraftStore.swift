import Combine
import Foundation

struct VoiceWritingSourceReference: Codable, Equatable, Identifiable {
    let localRecordingID: UUID
    let transcriptClientRequestID: UUID
    let sourceSHA256: String
    let callRoomID: String?

    var id: UUID { localRecordingID }
}

struct VoiceWritingRemoteDraft: Codable, Equatable {
    let documentID: String
    let projectID: String
    let projectName: String
    let projectSlug: String
    let title: String
    let body: String
    let richText: VoiceWritingRichText?
    let contentRevision: String
    let localRevision: Int
    let localRecordingID: UUID
    let sourceTranscriptClientRequestID: UUID
    let sourceSHA256: String
    let callRoomID: String?
    let sources: [VoiceWritingSourceReference]
    let tagRevision: Int
    let tags: [MobileCaptureTag]
    let availableTags: [MobileCaptureTag]
    let serverUpdatedAt: String
    let createdAt: Date
    let updatedAt: Date
}

struct VoiceWritingDraft: Codable, Identifiable, Equatable {
    let id: UUID
    let ownerAccountID: String
    let localRecordingID: UUID
    let sourceTranscriptClientRequestID: UUID
    let sourceSHA256: String
    let callRoomID: String?
    var sources: [VoiceWritingSourceReference]?
    let createdAt: Date
    var title: String
    var body: String
    var richText: VoiceWritingRichText?
    var updatedAt: Date
    var localRevision: Int
    var serverRevision: Int?
    var serverContentRevision: String?
    var canonicalDocumentID: String?
    var canonicalProjectID: String?
    var canonicalProjectName: String?
    var canonicalProjectSlug: String?
    var canonicalTagRevision: Int?
    var canonicalTags: [MobileCaptureTag]?
    var canonicalAvailableTags: [MobileCaptureTag]? = nil
    var canonicalUpdatedAt: String?
    var lastSyncedAt: Date?
    var lastSyncError: String?
    var pendingRemote: VoiceWritingRemoteDraft?

    var allSources: [VoiceWritingSourceReference] {
        if let sources, !sources.isEmpty { return sources }
        return [VoiceWritingSourceReference(
            localRecordingID: localRecordingID,
            transcriptClientRequestID: sourceTranscriptClientRequestID,
            sourceSHA256: sourceSHA256,
            callRoomID: callRoomID
        )]
    }

    var isSynced: Bool {
        serverRevision == localRevision
            && serverContentRevision != nil
            && canonicalDocumentID != nil
            && pendingRemote == nil
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

    private struct PendingContinuation: Codable, Equatable {
        let ownerAccountID: String
        let callRoomID: String
        let draftID: UUID
    }

    private struct Ledger: Codable {
        let schemaVersion: Int
        let drafts: [VoiceWritingDraft]
        let pendingContinuations: [PendingContinuation]?
    }

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedDrafts: [VoiceWritingDraft] = []
    private var pendingContinuations: [PendingContinuation] = []
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
            let ledger = try Self.loadLedger(
                fileManager: fileManager,
                primary: ledgerURL,
                fallback: lastKnownGoodURL
            )
            storedDrafts = ledger.drafts
            pendingContinuations = ledger.pendingContinuations ?? []
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
        drafts.first { $0.allSources.contains(where: { $0.localRecordingID == recordingID }) }
    }

    func draft(id: UUID) -> VoiceWritingDraft? {
        drafts.first { $0.id == id }
    }

    func stageContinuation(callRoomID: String, draftID: UUID) throws {
        let owner = try requireActiveOwner()
        let roomID = callRoomID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !roomID.isEmpty,
              storedDrafts.contains(where: { $0.ownerAccountID == owner && $0.id == draftID }) else {
            throw VoiceWritingDraftStoreError.draftUnavailable
        }
        pendingContinuations.removeAll { $0.ownerAccountID == owner && $0.callRoomID == roomID }
        pendingContinuations.append(PendingContinuation(
            ownerAccountID: owner,
            callRoomID: roomID,
            draftID: draftID
        ))
        try commit()
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
            $0.ownerAccountID == owner
                && $0.allSources.contains(where: { $0.localRecordingID == recording.id })
        }) {
            return existing
        }

        let composedWriting = VoiceWritingTextComposer.richText(from: transcript.segments.map {
            VoiceWritingTimedPhrase(
                text: $0.text,
                startSeconds: $0.startSeconds,
                endSeconds: $0.endSeconds
            )
        })
        let body = composedWriting.text
        guard !body.isEmpty else { return nil }

        if let roomID = recording.callRoomId?.trimmingCharacters(in: .whitespacesAndNewlines),
           let continuation = pendingContinuations.first(where: {
               $0.ownerAccountID == owner && $0.callRoomID == roomID
           }),
           let index = storedDrafts.firstIndex(where: {
               $0.ownerAccountID == owner && $0.id == continuation.draftID
           }) {
            let source = Self.sourceReference(transcript: transcript, recording: recording)
            if !storedDrafts[index].allSources.contains(where: { $0.id == source.id }) {
                storedDrafts[index].sources = storedDrafts[index].allSources + [source]
                let existingBody = storedDrafts[index].body.trimmingCharacters(in: .whitespacesAndNewlines)
                storedDrafts[index].body = existingBody.isEmpty ? body : "\(existingBody)\n\n\(body)"
                storedDrafts[index].richText = (storedDrafts[index].richText
                    ?? VoiceWritingRichText(text: existingBody))
                    .appending(composedWriting)
                storedDrafts[index].updatedAt = now
                storedDrafts[index].localRevision += 1
                storedDrafts[index].lastSyncError = nil
            }
            pendingContinuations.removeAll {
                $0.ownerAccountID == owner && $0.callRoomID == roomID
            }
            commitBestEffort()
            return storedDrafts[index]
        }

        let sessionTitle = recording.sessionTitle?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let normalizedSessionTitle = sessionTitle.lowercased()
        let keepsSessionTitle = !sessionTitle.isEmpty
            && !normalizedSessionTitle.hasPrefix("voice note ·")
            && !normalizedSessionTitle.hasPrefix("speak to write ·")
        let title = keepsSessionTitle
            ? sessionTitle
            : VoiceWritingTextComposer.suggestedTitle(from: body) ?? recording.displayTitle
        let draft = VoiceWritingDraft(
            id: recording.id,
            ownerAccountID: owner,
            localRecordingID: recording.id,
            sourceTranscriptClientRequestID: transcript.clientRequestId,
            sourceSHA256: transcript.sourceSha256,
            callRoomID: recording.voiceWritingCallRoomId,
            sources: [Self.sourceReference(transcript: transcript, recording: recording)],
            createdAt: now,
            title: title,
            body: body,
            richText: composedWriting,
            updatedAt: now,
            localRevision: 1,
            serverRevision: nil,
            serverContentRevision: nil,
            canonicalDocumentID: nil,
            canonicalProjectID: nil,
            canonicalProjectName: nil,
            canonicalProjectSlug: nil,
            canonicalTagRevision: nil,
            canonicalTags: nil,
            canonicalUpdatedAt: nil,
            lastSyncedAt: nil,
            lastSyncError: nil,
            pendingRemote: nil
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
        richText: VoiceWritingRichText? = nil,
        now: Date = Date()
    ) throws -> VoiceWritingDraft {
        let owner = try requireActiveOwner()
        guard let index = storedDrafts.firstIndex(where: {
            $0.ownerAccountID == owner
                && $0.allSources.contains(where: { $0.localRecordingID == recordingID })
        }) else {
            throw VoiceWritingDraftStoreError.draftUnavailable
        }
        let cleanTitle = title.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedBody = body.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let cappedBody = String(normalizedBody.prefix(200_000))
        let normalizedRichText = richText?.text == cappedBody
            ? richText
            : VoiceWritingRichText(text: cappedBody)
        guard storedDrafts[index].title != cleanTitle
                || storedDrafts[index].body != cappedBody
                || storedDrafts[index].richText != normalizedRichText else {
            return storedDrafts[index]
        }
        storedDrafts[index].title = cleanTitle.isEmpty ? "Voice note" : String(cleanTitle.prefix(320))
        storedDrafts[index].body = cappedBody
        storedDrafts[index].richText = normalizedRichText
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
        contentRevision: String,
        syncedLocalRevision: Int,
        projectID: String,
        projectName: String,
        projectSlug: String,
        tagRevision: Int,
        tags: [MobileCaptureTag],
        availableTags: [MobileCaptureTag],
        sources: [VoiceWritingSourceReference],
        richText: VoiceWritingRichText?,
        serverUpdatedAt: String,
        at date: Date = Date()
    ) {
        guard let owner = try? requireActiveOwner(),
              let index = storedDrafts.firstIndex(where: {
                  $0.ownerAccountID == owner
                      && $0.allSources.contains(where: { $0.localRecordingID == recordingID })
              }) else { return }
        storedDrafts[index].canonicalDocumentID = canonicalDocumentID
        storedDrafts[index].serverRevision = min(serverRevision, syncedLocalRevision)
        storedDrafts[index].serverContentRevision = contentRevision
        storedDrafts[index].canonicalProjectID = projectID
        storedDrafts[index].canonicalProjectName = projectName
        storedDrafts[index].canonicalProjectSlug = projectSlug
        storedDrafts[index].canonicalTagRevision = tagRevision
        storedDrafts[index].canonicalTags = tags
        storedDrafts[index].canonicalAvailableTags = availableTags
        storedDrafts[index].sources = sources
        if storedDrafts[index].localRevision == syncedLocalRevision {
            storedDrafts[index].richText = richText
        }
        storedDrafts[index].canonicalUpdatedAt = serverUpdatedAt
        storedDrafts[index].lastSyncedAt = date
        storedDrafts[index].lastSyncError = nil
        storedDrafts[index].pendingRemote = nil
        commitBestEffort()
    }

    func reconcile(_ remote: VoiceWritingRemoteDraft) {
        guard let owner = try? requireActiveOwner() else { return }
        if let index = storedDrafts.firstIndex(where: {
            $0.ownerAccountID == owner && $0.id == remote.localRecordingID
        }) {
            let mergedSources = Self.mergedSources(
                storedDrafts[index].allSources,
                remote.sources
            )
            storedDrafts[index].canonicalProjectID = remote.projectID
            storedDrafts[index].canonicalProjectName = remote.projectName
            storedDrafts[index].canonicalProjectSlug = remote.projectSlug
            storedDrafts[index].canonicalTagRevision = remote.tagRevision
            storedDrafts[index].canonicalTags = remote.tags
            storedDrafts[index].canonicalAvailableTags = remote.availableTags
            storedDrafts[index].canonicalUpdatedAt = remote.serverUpdatedAt
            storedDrafts[index].sources = mergedSources
            let hasLocalChanges = storedDrafts[index].serverRevision != storedDrafts[index].localRevision
            if storedDrafts[index].serverContentRevision == remote.contentRevision {
                storedDrafts[index].canonicalDocumentID = remote.documentID
                if !hasLocalChanges {
                    storedDrafts[index].serverRevision = storedDrafts[index].localRevision
                    storedDrafts[index].lastSyncedAt = Date()
                }
                storedDrafts[index].lastSyncError = nil
                storedDrafts[index].pendingRemote = nil
            } else if hasLocalChanges {
                storedDrafts[index].pendingRemote = remote
                storedDrafts[index].lastSyncError = nil
            } else {
                storedDrafts[index].title = remote.title
                storedDrafts[index].body = remote.body
                storedDrafts[index].richText = remote.richText
                storedDrafts[index].updatedAt = remote.updatedAt
                storedDrafts[index].localRevision = max(storedDrafts[index].localRevision, remote.localRevision)
                storedDrafts[index].serverRevision = storedDrafts[index].localRevision
                storedDrafts[index].serverContentRevision = remote.contentRevision
                storedDrafts[index].canonicalDocumentID = remote.documentID
                storedDrafts[index].lastSyncedAt = Date()
                storedDrafts[index].lastSyncError = nil
                storedDrafts[index].pendingRemote = nil
            }
        } else {
            let revision = max(1, remote.localRevision)
            storedDrafts.append(VoiceWritingDraft(
                id: remote.localRecordingID,
                ownerAccountID: owner,
                localRecordingID: remote.localRecordingID,
                sourceTranscriptClientRequestID: remote.sourceTranscriptClientRequestID,
                sourceSHA256: remote.sourceSHA256,
                callRoomID: remote.callRoomID,
                sources: remote.sources,
                createdAt: remote.createdAt,
                title: remote.title,
                body: remote.body,
                richText: remote.richText,
                updatedAt: remote.updatedAt,
                localRevision: revision,
                serverRevision: revision,
                serverContentRevision: remote.contentRevision,
                canonicalDocumentID: remote.documentID,
                canonicalProjectID: remote.projectID,
                canonicalProjectName: remote.projectName,
                canonicalProjectSlug: remote.projectSlug,
                canonicalTagRevision: remote.tagRevision,
                canonicalTags: remote.tags,
                canonicalAvailableTags: remote.availableTags,
                canonicalUpdatedAt: remote.serverUpdatedAt,
                lastSyncedAt: Date(),
                lastSyncError: nil,
                pendingRemote: nil
            ))
        }
        commitBestEffort()
    }

    @discardableResult
    func useNestVersion(recordingID: UUID) -> VoiceWritingDraft? {
        guard let owner = try? requireActiveOwner(),
              let index = storedDrafts.firstIndex(where: {
                  $0.ownerAccountID == owner
                      && $0.allSources.contains(where: { $0.localRecordingID == recordingID })
              }),
              let remote = storedDrafts[index].pendingRemote else { return nil }
        storedDrafts[index].title = remote.title
        storedDrafts[index].body = remote.body
        storedDrafts[index].richText = remote.richText
        storedDrafts[index].sources = remote.sources
        storedDrafts[index].updatedAt = remote.updatedAt
        storedDrafts[index].localRevision = max(storedDrafts[index].localRevision, remote.localRevision)
        storedDrafts[index].serverRevision = storedDrafts[index].localRevision
        storedDrafts[index].serverContentRevision = remote.contentRevision
        storedDrafts[index].canonicalDocumentID = remote.documentID
        storedDrafts[index].lastSyncedAt = Date()
        storedDrafts[index].lastSyncError = nil
        storedDrafts[index].pendingRemote = nil
        commitBestEffort()
        return storedDrafts[index]
    }

    @discardableResult
    func keepIPhoneVersion(recordingID: UUID) -> VoiceWritingDraft? {
        guard let owner = try? requireActiveOwner(),
              let index = storedDrafts.firstIndex(where: {
                  $0.ownerAccountID == owner
                      && $0.allSources.contains(where: { $0.localRecordingID == recordingID })
              }),
              let remote = storedDrafts[index].pendingRemote else { return nil }
        let nextRevision = max(storedDrafts[index].localRevision, remote.localRevision) + 1
        storedDrafts[index].localRevision = nextRevision
        storedDrafts[index].serverRevision = remote.localRevision
        storedDrafts[index].serverContentRevision = remote.contentRevision
        storedDrafts[index].canonicalDocumentID = remote.documentID
        storedDrafts[index].lastSyncError = nil
        storedDrafts[index].pendingRemote = nil
        commitBestEffort()
        return storedDrafts[index]
    }

    func markSyncFailed(recordingID: UUID, message: String) {
        guard let owner = try? requireActiveOwner(),
              let index = storedDrafts.firstIndex(where: {
                  $0.ownerAccountID == owner
                      && $0.allSources.contains(where: { $0.localRecordingID == recordingID })
              }) else { return }
        storedDrafts[index].lastSyncError = message
        commitBestEffort()
    }

    /// Removes only the editable writing projection. LocalRecordingLibrary and
    /// its immutable timed transcript remain the recoverable source of truth.
    func remove(recordingID: UUID) throws {
        let owner = try requireActiveOwner()
        guard let index = storedDrafts.firstIndex(where: {
            $0.ownerAccountID == owner
                && $0.allSources.contains(where: { $0.localRecordingID == recordingID })
        }) else {
            throw VoiceWritingDraftStoreError.draftUnavailable
        }
        let draftID = storedDrafts[index].id
        let previousDrafts = storedDrafts
        let previousContinuations = pendingContinuations
        storedDrafts.remove(at: index)
        pendingContinuations.removeAll {
            $0.ownerAccountID == owner && $0.draftID == draftID
        }
        do {
            try commit()
        } catch {
            storedDrafts = previousDrafts
            pendingContinuations = previousContinuations
            publishActiveDrafts()
            throw error
        }
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
        let data = try encoder.encode(Ledger(
            schemaVersion: 2,
            drafts: storedDrafts,
            pendingContinuations: pendingContinuations
        ))
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
    ) throws -> Ledger {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        for url in [primary, fallback] where fileManager.fileExists(atPath: url.path) {
            if let data = try? Data(contentsOf: url, options: [.mappedIfSafe]),
               let ledger = try? decoder.decode(Ledger.self, from: data),
               [1, 2].contains(ledger.schemaVersion) {
                return ledger
            }
        }
        return Ledger(schemaVersion: 2, drafts: [], pendingContinuations: [])
    }

    private static func sourceReference(
        transcript: OnDeviceTranscriptSidecar,
        recording: LocalRecording
    ) -> VoiceWritingSourceReference {
        VoiceWritingSourceReference(
            localRecordingID: recording.id,
            transcriptClientRequestID: transcript.clientRequestId,
            sourceSHA256: transcript.sourceSha256,
            callRoomID: recording.voiceWritingCallRoomId
        )
    }

    private static func mergedSources(
        _ primary: [VoiceWritingSourceReference],
        _ secondary: [VoiceWritingSourceReference]
    ) -> [VoiceWritingSourceReference] {
        var seen = Set<UUID>()
        return (primary + secondary).filter { seen.insert($0.localRecordingID).inserted }
    }

    private static func normalizedOwnerID(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return normalized.isEmpty ? nil : normalized
    }
}

private struct VoiceWritingSyncRequest: Encodable {
    struct Source: Encodable {
        let localRecordingId: String
        let transcriptClientRequestId: String
        let sourceSha256: String
        let callRoomId: String?

        init(_ source: VoiceWritingSourceReference) {
            localRecordingId = source.localRecordingID.uuidString.lowercased()
            transcriptClientRequestId = source.transcriptClientRequestID.uuidString.lowercased()
            sourceSha256 = source.sourceSHA256
            callRoomId = source.callRoomID
        }
    }

    let draftId: String
    let localRecordingId: String
    let transcriptClientRequestId: String
    let sourceSha256: String
    let callRoomId: String?
    let title: String
    let body: String
    let richText: VoiceWritingRichText?
    let localRevision: Int
    let expectedServerRevision: Int
    let expectedContentRevision: String?
    let sources: [Source]

    @MainActor
    init(_ draft: VoiceWritingDraft) {
        draftId = draft.id.uuidString.lowercased()
        localRecordingId = draft.localRecordingID.uuidString.lowercased()
        transcriptClientRequestId = draft.sourceTranscriptClientRequestID.uuidString.lowercased()
        sourceSha256 = draft.sourceSHA256
        callRoomId = draft.callRoomID
        title = draft.title
        body = draft.body
        richText = draft.richText
        localRevision = draft.localRevision
        expectedServerRevision = draft.serverRevision ?? 0
        expectedContentRevision = draft.serverContentRevision
        sources = draft.allSources.map(Source.init)
    }
}

struct VoiceWritingHomeProject: Codable, Equatable {
    let id: String
    let name: String
    let slug: String
}

struct VoiceWritingNestDestination: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let slug: String
    let role: String
    let isHome: Bool

    var accessLabel: String {
        if isHome { return "My Nest" }
        return role.uppercased() == "OWNER" ? "Owned Nest" : "Shared Nest"
    }
}

private struct VoiceWritingSyncResponse: Decodable {
    struct SavedSource: Decodable {
        let localRecordingId: String
        let transcriptClientRequestId: String
        let sourceSha256: String
        let callRoomId: String?
    }

    struct SavedDraft: Decodable {
        let draftId: String
        let documentId: String
        let projectId: String
        let projectName: String
        let projectSlug: String
        let title: String
        let body: String
        let richText: VoiceWritingRichText?
        let localRevision: Int
        let serverRevision: Int
        let contentRevision: String
        let localRecordingId: String
        let transcriptClientRequestId: String
        let sourceSha256: String
        let callRoomId: String?
        let sources: [SavedSource]?
        let tagRevision: Int
        let tags: [MobileCaptureTag]
        let availableTags: [MobileCaptureTag]?
        let createdAt: String?
        let updatedAt: String
    }

    let ok: Bool
    let code: String?
    let error: String?
    let draft: SavedDraft?
    let current: SavedDraft?
    let homeProject: VoiceWritingHomeProject?
    let availableTags: [MobileCaptureTag]?
    let destinations: [VoiceWritingNestDestination]?
}

private struct VoiceWritingListResponse: Decodable {
    let ok: Bool
    let error: String?
    let drafts: [VoiceWritingSyncResponse.SavedDraft]?
    let homeProject: VoiceWritingHomeProject?
    let availableTags: [MobileCaptureTag]?
    let destinations: [VoiceWritingNestDestination]?
}

private struct VoiceWritingMoveRequest: Encodable {
    let draftId: String
    let destinationProjectId: String
    let expectedProjectId: String
    let clientRequestId: String
}

private struct VoiceWritingMoveResponse: Decodable {
    let ok: Bool
    let code: String?
    let error: String?
    let draft: VoiceWritingSyncResponse.SavedDraft?
    let current: VoiceWritingSyncResponse.SavedDraft?
}

private struct VoiceWritingDeleteRequest: Encodable {
    let draftId: String
    let clientRequestId: String
}

private struct VoiceWritingDeleteResponse: Decodable {
    let ok: Bool
    let error: String?
}

/// Debounced local-first synchronization for private writing. Typing never
/// waits on the network: the protected draft is saved first, then the latest
/// revision is sent with an optimistic Nest revision. A collision preserves
/// the complete iPhone copy instead of silently overwriting another edit.
@MainActor
final class VoiceWritingDraftSyncClient: ObservableObject {
    static let shared = VoiceWritingDraftSyncClient()

    @Published private(set) var syncingRecordingIDs: Set<UUID> = []
    @Published private(set) var movingRecordingIDs: Set<UUID> = []
    @Published private(set) var isRefreshing = false
    @Published private(set) var refreshError: String?
    @Published private(set) var homeProject: VoiceWritingHomeProject?
    @Published private(set) var availableTags: [MobileCaptureTag] = []
    @Published private(set) var destinations: [VoiceWritingNestDestination] = []
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

    func refreshFromNest() async {
        guard !isRefreshing,
              AuthManager.shared.networkActionsAllowed,
              let endpoint = URL(string: "\(apiBaseURL)/api/mobile/capture/voice-writing") else { return }
        isRefreshing = true
        refreshError = nil
        defer { isRefreshing = false }
        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(VoiceWritingListResponse.self, from: data)
            guard (200...299).contains(response.statusCode), payload.ok else {
                throw NSError(
                    domain: "QuipslyVoiceWriting",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Writing could not refresh yet."]
                )
            }
            homeProject = payload.homeProject
            availableTags = (payload.availableTags ?? []).filter { $0.isActive != false }
            destinations = payload.destinations ?? []
            for saved in payload.drafts ?? [] {
                if let remote = Self.remoteDraft(from: saved) {
                    VoiceWritingDraftStore.shared.reconcile(remote)
                }
            }
            for draft in VoiceWritingDraftStore.shared.drafts
                where !draft.isSynced && draft.pendingRemote == nil {
                schedule(draft, delay: .zero)
            }
        } catch {
            refreshError = error.localizedDescription
        }
    }

    func delete(recordingID: UUID) async throws {
        pendingTasks[recordingID]?.cancel()
        pendingTasks[recordingID] = nil
        for _ in 0..<100 where syncingRecordingIDs.contains(recordingID) {
            try await Task.sleep(for: .milliseconds(50))
        }
        guard !syncingRecordingIDs.contains(recordingID) else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -3,
                userInfo: [NSLocalizedDescriptionKey: "Quipsly is finishing the last save. Try Delete again in a moment."]
            )
        }
        guard let draft = VoiceWritingDraftStore.shared.draft(for: recordingID) else {
            throw VoiceWritingDraftStoreError.draftUnavailable
        }
        guard AuthManager.shared.networkActionsAllowed else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Connect to Quipsly before deleting this writing."]
            )
        }
        guard let endpoint = URL(string: "\(apiBaseURL)/api/mobile/capture/voice-writing") else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -2,
                userInfo: [NSLocalizedDescriptionKey: "Quipsly's private writing address is invalid."]
            )
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONEncoder().encode(VoiceWritingDeleteRequest(
            draftId: draft.id.uuidString.lowercased(),
            clientRequestId: UUID().uuidString.lowercased()
        ))
        let (data, response) = try await AuthManager.shared.authenticatedData(
            for: request,
            expectedOwnerAccountID: draft.ownerAccountID
        )
        let payload = try JSONDecoder().decode(VoiceWritingDeleteResponse.self, from: data)
        if response.statusCode == 404 {
            try VoiceWritingDraftStore.shared.remove(recordingID: recordingID)
            return
        }
        guard (200...299).contains(response.statusCode), payload.ok else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: response.statusCode,
                userInfo: [NSLocalizedDescriptionKey: payload.error ?? "This writing could not be deleted yet."]
            )
        }
        try VoiceWritingDraftStore.shared.remove(recordingID: recordingID)
    }

    func move(recordingID: UUID, to destination: VoiceWritingNestDestination) async throws {
        guard !movingRecordingIDs.contains(recordingID) else { return }
        pendingTasks[recordingID]?.cancel()
        pendingTasks[recordingID] = nil
        for _ in 0..<100 where syncingRecordingIDs.contains(recordingID) {
            try await Task.sleep(for: .milliseconds(50))
        }
        guard !syncingRecordingIDs.contains(recordingID) else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -3,
                userInfo: [NSLocalizedDescriptionKey: "Quipsly is finishing the last save. Try moving this writing again in a moment."]
            )
        }
        if VoiceWritingDraftStore.shared.draft(for: recordingID)?.isSynced != true {
            await syncLatest(recordingID: recordingID)
        }
        guard let draft = VoiceWritingDraftStore.shared.draft(for: recordingID),
              draft.isSynced,
              let currentProjectID = draft.canonicalProjectID?.trimmingCharacters(in: .whitespacesAndNewlines),
              !currentProjectID.isEmpty else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -4,
                userInfo: [NSLocalizedDescriptionKey: "Let this writing finish saving before moving it."]
            )
        }
        guard destination.id != currentProjectID else { return }
        guard AuthManager.shared.networkActionsAllowed,
              let endpoint = URL(string: "\(apiBaseURL)/api/mobile/capture/voice-writing") else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Connect to Quipsly before moving this writing."]
            )
        }

        movingRecordingIDs.insert(recordingID)
        defer { movingRecordingIDs.remove(recordingID) }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONEncoder().encode(VoiceWritingMoveRequest(
            draftId: draft.id.uuidString.lowercased(),
            destinationProjectId: destination.id,
            expectedProjectId: currentProjectID,
            clientRequestId: UUID().uuidString.lowercased()
        ))
        let (data, response) = try await AuthManager.shared.authenticatedData(
            for: request,
            expectedOwnerAccountID: draft.ownerAccountID
        )
        let payload = try JSONDecoder().decode(VoiceWritingMoveResponse.self, from: data)
        if response.statusCode == 409,
           payload.code == "VOICE_WRITING_MOVE_CONFLICT",
           let current = payload.current,
           let remote = Self.remoteDraft(from: current) {
            VoiceWritingDraftStore.shared.reconcile(remote)
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: response.statusCode,
                userInfo: [NSLocalizedDescriptionKey: payload.error ?? "This writing moved somewhere else. Its current Nest is now shown."]
            )
        }
        guard (200...299).contains(response.statusCode),
              payload.ok,
              let saved = payload.draft,
              let remote = Self.remoteDraft(from: saved) else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: response.statusCode,
                userInfo: [NSLocalizedDescriptionKey: payload.error ?? "This writing could not move yet."]
            )
        }
        VoiceWritingDraftStore.shared.reconcile(remote)
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
            if response.statusCode == 409,
               payload.code == "VOICE_WRITING_CONFLICT",
               let current = payload.current,
               let remote = Self.remoteDraft(from: current) {
                VoiceWritingDraftStore.shared.reconcile(remote)
                return
            }
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
                contentRevision: saved.contentRevision,
                syncedLocalRevision: saved.localRevision,
                projectID: saved.projectId,
                projectName: saved.projectName,
                projectSlug: saved.projectSlug,
                tagRevision: saved.tagRevision,
                tags: saved.tags,
                availableTags: (saved.availableTags ?? []).filter { $0.isActive != false },
                sources: Self.mergedSources(
                    draft.allSources,
                    Self.sourceReferences(from: saved)
                ),
                richText: saved.richText,
                serverUpdatedAt: saved.updatedAt
            )
            homeProject = payload.homeProject
            availableTags = (payload.availableTags ?? []).filter { $0.isActive != false }
            if let updatedDestinations = payload.destinations {
                destinations = updatedDestinations
            }
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

    private static func remoteDraft(from saved: VoiceWritingSyncResponse.SavedDraft) -> VoiceWritingRemoteDraft? {
        guard let recordingID = UUID(uuidString: saved.localRecordingId),
              let transcriptID = UUID(uuidString: saved.transcriptClientRequestId),
              saved.contentRevision.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else {
            return nil
        }
        let formatter = ISO8601DateFormatter()
        let updatedAt = formatter.date(from: saved.updatedAt) ?? Date()
        let createdAt = saved.createdAt.flatMap(formatter.date(from:)) ?? updatedAt
        return VoiceWritingRemoteDraft(
            documentID: saved.documentId,
            projectID: saved.projectId,
            projectName: saved.projectName,
            projectSlug: saved.projectSlug,
            title: saved.title,
            body: saved.body,
            richText: saved.richText,
            contentRevision: saved.contentRevision,
            localRevision: max(1, saved.localRevision),
            localRecordingID: recordingID,
            sourceTranscriptClientRequestID: transcriptID,
            sourceSHA256: saved.sourceSha256,
            callRoomID: saved.callRoomId,
            sources: sourceReferences(from: saved),
            tagRevision: saved.tagRevision,
            tags: saved.tags,
            availableTags: (saved.availableTags ?? []).filter { $0.isActive != false },
            serverUpdatedAt: saved.updatedAt,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

    private static func sourceReferences(
        from saved: VoiceWritingSyncResponse.SavedDraft
    ) -> [VoiceWritingSourceReference] {
        let mapped = (saved.sources ?? []).compactMap { source -> VoiceWritingSourceReference? in
            guard let recordingID = UUID(uuidString: source.localRecordingId),
                  let transcriptID = UUID(uuidString: source.transcriptClientRequestId),
                  source.sourceSha256.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else {
                return nil
            }
            return VoiceWritingSourceReference(
                localRecordingID: recordingID,
                transcriptClientRequestID: transcriptID,
                sourceSHA256: source.sourceSha256,
                callRoomID: source.callRoomId
            )
        }
        if !mapped.isEmpty { return mapped }
        guard let recordingID = UUID(uuidString: saved.localRecordingId),
              let transcriptID = UUID(uuidString: saved.transcriptClientRequestId) else { return [] }
        return [VoiceWritingSourceReference(
            localRecordingID: recordingID,
            transcriptClientRequestID: transcriptID,
            sourceSHA256: saved.sourceSha256,
            callRoomID: saved.callRoomId
        )]
    }

    private static func mergedSources(
        _ primary: [VoiceWritingSourceReference],
        _ secondary: [VoiceWritingSourceReference]
    ) -> [VoiceWritingSourceReference] {
        var seen = Set<UUID>()
        return (primary + secondary).filter { seen.insert($0.localRecordingID).inserted }
    }
}
