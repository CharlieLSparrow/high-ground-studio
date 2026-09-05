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
    let draftID: UUID
    let documentID: String
    let projectID: String
    let projectName: String
    let projectSlug: String
    let visibility: String?
    let title: String
    let body: String
    let richText: VoiceWritingRichText?
    let contentRevision: String
    let localRevision: Int
    let writingOrigin: String
    let localRecordingID: UUID?
    let sourceTranscriptClientRequestID: UUID?
    let sourceSHA256: String?
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
    let writingOrigin: String?
    let localRecordingID: UUID?
    let sourceTranscriptClientRequestID: UUID?
    let sourceSHA256: String?
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
    var preferredProjectID: String? = nil
    var preferredProjectName: String? = nil
    var preferredProjectSlug: String? = nil
    var canonicalDocumentID: String?
    var canonicalProjectID: String?
    var canonicalProjectName: String?
    var canonicalProjectSlug: String?
    var canonicalVisibility: String?
    var canonicalTagRevision: Int?
    var canonicalTags: [MobileCaptureTag]?
    var canonicalAvailableTags: [MobileCaptureTag]? = nil
    var canonicalUpdatedAt: String?
    var lastSyncedAt: Date?
    var lastSyncError: String?
    var pendingRemote: VoiceWritingRemoteDraft?

    var allSources: [VoiceWritingSourceReference] {
        if let sources { return sources }
        guard let localRecordingID,
              let sourceTranscriptClientRequestID,
              let sourceSHA256 else { return [] }
        return [VoiceWritingSourceReference(
            localRecordingID: localRecordingID,
            transcriptClientRequestID: sourceTranscriptClientRequestID,
            sourceSHA256: sourceSHA256,
            callRoomID: callRoomID
        )]
    }

    var primaryRecordingID: UUID? { allSources.first?.localRecordingID }

    var effectiveCallRoomID: String? {
        callRoomID ?? allSources.compactMap(\.callRoomID).first
    }

    var beganWithVoice: Bool { writingOrigin != "typed" }

    /// User-facing title with legacy machine-purpose leakage repaired. The
    /// canonical stored title is not mutated until the author actually saves.
    var presentedTitle: String {
        VoiceWritingTextComposer.presentedTitle(title, body: body)
    }

    var isUntouchedTypedDraft: Bool {
        writingOrigin == "typed"
            && canonicalDocumentID == nil
            && allSources.isEmpty
            && title.trimmingCharacters(in: .whitespacesAndNewlines) == "Untitled"
            && body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var isSynced: Bool {
        serverRevision == localRevision
            && serverContentRevision != nil
            && canonicalDocumentID != nil
            && pendingRemote == nil
    }

    var isSharedWithNest: Bool { canonicalVisibility == "nest" }
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
            "This writing draft is no longer available on this device."
        case .protectedStorageUnavailable:
            "Protected writing storage is unavailable. Quipsly did not claim the draft was saved."
        }
    }
}

/// Private, actor-partitioned working copies for keyboard-first, voice-first,
/// and mixed writing. Connected recordings and timed transcripts remain source
/// evidence; the draft is the intentionally editable document. Every edit is
/// committed locally before Quipsly attempts Nest synchronization.
@MainActor
final class VoiceWritingDraftStore: ObservableObject {
    static let shared = VoiceWritingDraftStore()

    @Published private(set) var drafts: [VoiceWritingDraft] = []
    @Published private(set) var persistenceError: String?

    private struct PendingContinuation: Codable, Equatable {
        let ownerAccountID: String
        let callRoomID: String
        let draftID: UUID
        let insertionUtf16: Int?
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
            storedDrafts = ledger.drafts.filter { !$0.isUntouchedTypedDraft }
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

    /// Returns only deliberate document-level recognition context for the
    /// signed-in owner. Body text stays out of speech configuration: context
    /// should improve names and topics without silently biasing recognition
    /// toward everything a person has written.
    func recognitionContext(
        callRoomID: String?,
        ownerAccountID: String?
    ) -> VoiceWritingRecognitionContext? {
        guard let owner = Self.normalizedOwnerID(ownerAccountID),
              owner == Self.normalizedOwnerID(activeOwnerAccountID),
              let roomID = callRoomID?.trimmingCharacters(in: .whitespacesAndNewlines),
              !roomID.isEmpty else { return nil }

        let pendingDraftID = pendingContinuations.first(where: {
            $0.ownerAccountID == owner && $0.callRoomID == roomID
        })?.draftID
        let draft = storedDrafts.first(where: {
            $0.ownerAccountID == owner
                && ($0.id == pendingDraftID
                    || $0.callRoomID == roomID
                    || $0.allSources.contains(where: { $0.callRoomID == roomID }))
        })
        guard let draft else { return nil }
        return VoiceWritingRecognitionContext(
            documentTitle: draft.presentedTitle,
            nestName: draft.canonicalProjectName,
            tagLabels: (draft.canonicalTags ?? []).map(\.label)
        )
    }

    func recognitionContext(for recording: LocalRecording) -> VoiceWritingRecognitionContext? {
        recognitionContext(
            callRoomID: recording.voiceWritingCallRoomId,
            ownerAccountID: recording.ownerAccountID
        )
    }

    @discardableResult
    func createTypedDraft(
        projectID: String? = nil,
        projectName: String? = nil,
        projectSlug: String? = nil,
        now: Date = Date()
    ) throws -> VoiceWritingDraft {
        let owner = try requireActiveOwner()
        let draft = VoiceWritingDraft(
            id: UUID(),
            ownerAccountID: owner,
            writingOrigin: "typed",
            localRecordingID: nil,
            sourceTranscriptClientRequestID: nil,
            sourceSHA256: nil,
            callRoomID: nil,
            sources: [],
            createdAt: now,
            title: "Untitled",
            body: "",
            richText: VoiceWritingRichText(text: ""),
            updatedAt: now,
            localRevision: 1,
            serverRevision: nil,
            serverContentRevision: nil,
            preferredProjectID: Self.normalizedNonempty(projectID),
            preferredProjectName: Self.normalizedNonempty(projectName),
            preferredProjectSlug: Self.normalizedNonempty(projectSlug),
            canonicalDocumentID: nil,
            canonicalProjectID: nil,
            canonicalProjectName: nil,
            canonicalProjectSlug: nil,
            canonicalVisibility: nil,
            canonicalTagRevision: nil,
            canonicalTags: nil,
            canonicalAvailableTags: nil,
            canonicalUpdatedAt: nil,
            lastSyncedAt: nil,
            lastSyncError: nil,
            pendingRemote: nil
        )
        storedDrafts.append(draft)
        try commit()
        return draft
    }

    func stageContinuation(
        callRoomID: String,
        draftID: UUID,
        insertionUtf16: Int? = nil
    ) throws {
        let owner = try requireActiveOwner()
        let roomID = callRoomID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !roomID.isEmpty,
              let draft = storedDrafts.first(where: {
                  $0.ownerAccountID == owner && $0.id == draftID
              }) else {
            throw VoiceWritingDraftStoreError.draftUnavailable
        }
        let boundedInsertion = insertionUtf16.map {
            min(max(0, $0), (draft.body as NSString).length)
        }
        pendingContinuations.removeAll { $0.ownerAccountID == owner && $0.callRoomID == roomID }
        pendingContinuations.append(PendingContinuation(
            ownerAccountID: owner,
            callRoomID: roomID,
            draftID: draftID,
            insertionUtf16: boundedInsertion
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
                let existingBody = storedDrafts[index].body
                let existingWriting = storedDrafts[index].richText
                    ?? VoiceWritingRichText(text: existingBody)
                let combinedWriting = continuation.insertionUtf16.map {
                    existingWriting.insertingSpokenParagraph(
                        composedWriting,
                        afterUtf16: $0
                    )
                } ?? existingWriting.appending(composedWriting)
                if let suggestedTitle = VoiceWritingTextComposer.suggestedContinuationTitle(
                    currentTitle: storedDrafts[index].title,
                    currentBody: existingBody,
                    combinedBody: combinedWriting.text
                ) {
                    storedDrafts[index].title = suggestedTitle
                }
                storedDrafts[index].body = combinedWriting.text
                storedDrafts[index].richText = combinedWriting
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
            && VoiceWritingTextComposer.presentedTitle(sessionTitle, body: body) == sessionTitle
        let title = keepsSessionTitle
            ? sessionTitle
            : VoiceWritingTextComposer.suggestedTitle(from: body) ?? recording.displayTitle
        let draft = VoiceWritingDraft(
            id: recording.id,
            ownerAccountID: owner,
            writingOrigin: "recorded",
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
            canonicalVisibility: nil,
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
        guard let draftID = draft(for: recordingID)?.id else {
            throw VoiceWritingDraftStoreError.draftUnavailable
        }
        return try update(
            draftID: draftID,
            title: title,
            body: body,
            richText: richText,
            now: now
        )
    }

    @discardableResult
    func update(
        draftID: UUID,
        title: String,
        body: String,
        richText: VoiceWritingRichText? = nil,
        now: Date = Date()
    ) throws -> VoiceWritingDraft {
        let owner = try requireActiveOwner()
        guard let index = storedDrafts.firstIndex(where: {
            $0.ownerAccountID == owner && $0.id == draftID
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
        storedDrafts[index].title = cleanTitle.isEmpty ? "Untitled" : String(cleanTitle.prefix(320))
        storedDrafts[index].body = cappedBody
        storedDrafts[index].richText = normalizedRichText
        storedDrafts[index].updatedAt = now
        storedDrafts[index].localRevision += 1
        storedDrafts[index].lastSyncError = nil
        try commit()
        return storedDrafts[index]
    }

    func markSynced(
        draftID: UUID,
        canonicalDocumentID: String,
        serverRevision: Int,
        contentRevision: String,
        syncedLocalRevision: Int,
        projectID: String,
        projectName: String,
        projectSlug: String,
        visibility: String,
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
                  $0.ownerAccountID == owner && $0.id == draftID
              }) else { return }
        storedDrafts[index].canonicalDocumentID = canonicalDocumentID
        storedDrafts[index].serverRevision = min(serverRevision, syncedLocalRevision)
        storedDrafts[index].serverContentRevision = contentRevision
        storedDrafts[index].canonicalProjectID = projectID
        storedDrafts[index].canonicalProjectName = projectName
        storedDrafts[index].canonicalProjectSlug = projectSlug
        storedDrafts[index].canonicalVisibility = visibility
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
            $0.ownerAccountID == owner && $0.id == remote.draftID
        }) {
            let mergedSources = Self.mergedSources(
                storedDrafts[index].allSources,
                remote.sources
            )
            storedDrafts[index].canonicalProjectID = remote.projectID
            storedDrafts[index].canonicalProjectName = remote.projectName
            storedDrafts[index].canonicalProjectSlug = remote.projectSlug
            storedDrafts[index].canonicalVisibility = remote.visibility ?? "personal"
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
                id: remote.draftID,
                ownerAccountID: owner,
                writingOrigin: remote.writingOrigin,
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
                canonicalVisibility: remote.visibility ?? "personal",
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
    func useNestVersion(draftID: UUID) -> VoiceWritingDraft? {
        guard let owner = try? requireActiveOwner(),
              let index = storedDrafts.firstIndex(where: {
                  $0.ownerAccountID == owner && $0.id == draftID
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
        storedDrafts[index].canonicalVisibility = remote.visibility ?? "personal"
        storedDrafts[index].lastSyncedAt = Date()
        storedDrafts[index].lastSyncError = nil
        storedDrafts[index].pendingRemote = nil
        commitBestEffort()
        return storedDrafts[index]
    }

    @discardableResult
    func keepIPhoneVersion(draftID: UUID) -> VoiceWritingDraft? {
        guard let owner = try? requireActiveOwner(),
              let index = storedDrafts.firstIndex(where: {
                  $0.ownerAccountID == owner && $0.id == draftID
              }),
              let remote = storedDrafts[index].pendingRemote else { return nil }
        let nextRevision = max(storedDrafts[index].localRevision, remote.localRevision) + 1
        storedDrafts[index].localRevision = nextRevision
        storedDrafts[index].serverRevision = remote.localRevision
        storedDrafts[index].serverContentRevision = remote.contentRevision
        storedDrafts[index].canonicalDocumentID = remote.documentID
        storedDrafts[index].canonicalVisibility = remote.visibility ?? "personal"
        storedDrafts[index].lastSyncError = nil
        storedDrafts[index].pendingRemote = nil
        commitBestEffort()
        return storedDrafts[index]
    }

    func markSyncFailed(draftID: UUID, message: String) {
        guard let owner = try? requireActiveOwner(),
              let index = storedDrafts.firstIndex(where: {
                  $0.ownerAccountID == owner && $0.id == draftID
              }) else { return }
        storedDrafts[index].lastSyncError = message
        commitBestEffort()
    }

    /// Removes only the editable writing projection. LocalRecordingLibrary and
    /// its immutable timed transcript remain the recoverable source of truth.
    func remove(draftID: UUID) throws {
        let owner = try requireActiveOwner()
        guard let index = storedDrafts.firstIndex(where: {
            $0.ownerAccountID == owner && $0.id == draftID
        }) else {
            throw VoiceWritingDraftStoreError.draftUnavailable
        }
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
        if CaptureLaunchConfiguration.usesPreviewData {
            let previewOwner = Self.normalizedOwnerID(activeOwnerAccountID) ?? "preview-owner"
            activeOwnerAccountID = previewOwner
            return previewOwner
        }
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
            schemaVersion: 3,
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
               [1, 2, 3].contains(ledger.schemaVersion) {
                return ledger
            }
        }
        return Ledger(schemaVersion: 3, drafts: [], pendingContinuations: [])
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
        normalizedNonempty(value)
    }

    private static func normalizedNonempty(_ value: String?) -> String? {
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
    let writingOrigin: String
    let localRecordingId: String?
    let transcriptClientRequestId: String?
    let sourceSha256: String?
    let callRoomId: String?
    let title: String
    let body: String
    let richText: VoiceWritingRichText?
    let localRevision: Int
    let expectedServerRevision: Int
    let expectedContentRevision: String?
    let destinationProjectId: String?
    let sources: [Source]

    @MainActor
    init(_ draft: VoiceWritingDraft) {
        draftId = draft.id.uuidString.lowercased()
        writingOrigin = draft.beganWithVoice ? "recorded" : "typed"
        localRecordingId = draft.localRecordingID?.uuidString.lowercased()
        transcriptClientRequestId = draft.sourceTranscriptClientRequestID?.uuidString.lowercased()
        sourceSha256 = draft.sourceSHA256
        callRoomId = draft.callRoomID
        title = draft.title
        body = draft.body
        richText = draft.richText
        localRevision = draft.localRevision
        expectedServerRevision = draft.serverRevision ?? 0
        expectedContentRevision = draft.serverContentRevision
        destinationProjectId = draft.canonicalDocumentID == nil
            ? draft.preferredProjectID
            : nil
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

struct VoiceWritingRemoteTranscriptSegment: Decodable, Equatable, Identifiable {
    let id: String
    let startSeconds: Double
    let endSeconds: Double
    let text: String
    let speakerLabel: String?
    let providerText: String
    let providerSpeakerLabel: String?
    let acceptedCorrectionId: String?

    var timedSegment: OnDeviceTranscriptSegment? {
        let cleanText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !cleanText.isEmpty,
              startSeconds.isFinite,
              endSeconds.isFinite,
              startSeconds >= 0,
              endSeconds >= startSeconds else { return nil }
        return OnDeviceTranscriptSegment(
            startSeconds: startSeconds,
            endSeconds: endSeconds,
            text: cleanText
        )
    }
}

struct VoiceWritingRemoteTranscript: Decodable, Equatable {
    let transcriptClientRequestId: String
    let transcriptJobId: String
    let roomId: String?
    let language: String?
    let completedAt: String?
    let segments: [VoiceWritingRemoteTranscriptSegment]

    var transcriptClientRequestID: UUID? {
        UUID(uuidString: transcriptClientRequestId)
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
        let visibility: String?
        let title: String
        let body: String
        let richText: VoiceWritingRichText?
        let localRevision: Int
        let serverRevision: Int
        let contentRevision: String
        let writingOrigin: String?
        let localRecordingId: String?
        let transcriptClientRequestId: String?
        let sourceSha256: String?
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
    let transcripts: [VoiceWritingRemoteTranscript]?
}

private struct VoiceWritingMoveRequest: Encodable {
    let draftId: String
    let destinationProjectId: String
    let expectedProjectId: String
    let visibility: String
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

    @Published private(set) var syncingDraftIDs: Set<UUID> = []
    @Published private(set) var movingDraftIDs: Set<UUID> = []
    @Published private(set) var isRefreshing = false
    @Published private(set) var refreshError: String?
    @Published private(set) var homeProject: VoiceWritingHomeProject?
    @Published private(set) var availableTags: [MobileCaptureTag] = []
    @Published private(set) var destinations: [VoiceWritingNestDestination] = []
    @Published private(set) var remoteTranscriptsByRequestID: [UUID: VoiceWritingRemoteTranscript] = [:]
    @Published private(set) var loadingTranscriptDraftIDs: Set<UUID> = []
    @Published private(set) var transcriptRefreshErrors: [UUID: String] = [:]
    private var pendingTasks: [UUID: Task<Void, Never>] = [:]
    private var accountCancellable: AnyCancellable?
    private let nestBaseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )

    private init() {
        accountCancellable = NotificationCenter.default.publisher(
            for: .quipslyCaptureAccountIdentityDidChange
        ).sink { [weak self] _ in
            Task { @MainActor in
                self?.remoteTranscriptsByRequestID = [:]
                self?.loadingTranscriptDraftIDs = []
                self?.transcriptRefreshErrors = [:]
            }
        }
    }

    func schedule(_ draft: VoiceWritingDraft, delay: Duration = .milliseconds(650)) {
        guard !draft.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        pendingTasks[draft.id]?.cancel()
        pendingTasks[draft.id] = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.syncLatest(draftID: draft.id)
        }
    }

    func syncNow(draftID: UUID) {
        pendingTasks[draftID]?.cancel()
        pendingTasks[draftID] = nil
        Task { [weak self] in await self?.syncLatest(draftID: draftID) }
    }

    func refreshFromNest() async {
        guard !isRefreshing,
              AuthManager.shared.networkActionsAllowed,
              let endpoint = URL(string: "\(nestBaseURL)/api/mobile/capture/voice-writing") else { return }
        isRefreshing = true
        refreshError = nil
        defer { isRefreshing = false }
        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("2", forHTTPHeaderField: "X-Quipsly-Writing-Version")
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

    /// Loads timed transcript passages only for the writing a person opens.
    /// The ordinary Library refresh intentionally stays lightweight; a source-
    /// bound transcript may contain thousands of passages and should not be
    /// downloaded for every draft. Results are memory-only and account-scoped.
    func refreshTranscripts(draftID: UUID) async {
        guard !loadingTranscriptDraftIDs.contains(draftID),
              AuthManager.shared.networkActionsAllowed,
              let draft = VoiceWritingDraftStore.shared.draft(id: draftID),
              draft.canonicalDocumentID != nil,
              !draft.allSources.isEmpty,
              var components = URLComponents(string: "\(nestBaseURL)/api/mobile/capture/voice-writing") else { return }

        components.queryItems = [
            URLQueryItem(name: "draftId", value: draftID.uuidString.lowercased()),
        ]
        guard let endpoint = components.url else { return }

        let expectedOwnerAccountID = draft.ownerAccountID
        let expectedRequestIDs = Set(draft.allSources.map(\.transcriptClientRequestID))
        loadingTranscriptDraftIDs.insert(draftID)
        transcriptRefreshErrors[draftID] = nil
        defer { loadingTranscriptDraftIDs.remove(draftID) }

        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("2", forHTTPHeaderField: "X-Quipsly-Writing-Version")
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                expectedOwnerAccountID: expectedOwnerAccountID
            )
            let payload = try JSONDecoder().decode(VoiceWritingListResponse.self, from: data)
            guard (200...299).contains(response.statusCode), payload.ok else {
                throw NSError(
                    domain: "QuipslyVoiceWriting",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "The timed transcript could not refresh yet."]
                )
            }

            // A response is useful only while the same account still owns the
            // local working copy and the server returned the exact requested
            // document. This prevents a late request from crossing sign-in or
            // document-deletion boundaries.
            guard let currentDraft = VoiceWritingDraftStore.shared.draft(id: draftID),
                  currentDraft.ownerAccountID == expectedOwnerAccountID else { return }
            var next = remoteTranscriptsByRequestID
            for requestID in expectedRequestIDs {
                next[requestID] = nil
            }
            guard payload.drafts?.contains(where: {
                UUID(uuidString: $0.draftId) == draftID
            }) == true else {
                remoteTranscriptsByRequestID = next
                return
            }
            for transcript in payload.transcripts ?? [] {
                guard let requestID = transcript.transcriptClientRequestID,
                      expectedRequestIDs.contains(requestID),
                      next[requestID] == nil else { continue }
                let validSegments = transcript.segments.filter { $0.timedSegment != nil }
                guard !transcript.transcriptJobId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      !validSegments.isEmpty else { continue }
                next[requestID] = VoiceWritingRemoteTranscript(
                    transcriptClientRequestId: transcript.transcriptClientRequestId,
                    transcriptJobId: transcript.transcriptJobId,
                    roomId: transcript.roomId,
                    language: transcript.language,
                    completedAt: transcript.completedAt,
                    segments: validSegments
                )
            }
            remoteTranscriptsByRequestID = next
        } catch {
            transcriptRefreshErrors[draftID] = error.localizedDescription
        }
    }

    func remoteTranscript(
        for transcriptClientRequestID: UUID
    ) -> VoiceWritingRemoteTranscript? {
        remoteTranscriptsByRequestID[transcriptClientRequestID]
    }

    func delete(draftID: UUID) async throws {
        pendingTasks[draftID]?.cancel()
        pendingTasks[draftID] = nil
        for _ in 0..<100 where syncingDraftIDs.contains(draftID) {
            try await Task.sleep(for: .milliseconds(50))
        }
        guard !syncingDraftIDs.contains(draftID) else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -3,
                userInfo: [NSLocalizedDescriptionKey: "Quipsly is finishing the last save. Try Delete again in a moment."]
            )
        }
        guard let draft = VoiceWritingDraftStore.shared.draft(id: draftID) else {
            throw VoiceWritingDraftStoreError.draftUnavailable
        }
        if draft.canonicalDocumentID == nil {
            try VoiceWritingDraftStore.shared.remove(draftID: draftID)
            return
        }
        guard AuthManager.shared.networkActionsAllowed else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Connect to Quipsly before deleting this writing."]
            )
        }
        guard let endpoint = URL(string: "\(nestBaseURL)/api/mobile/capture/voice-writing") else {
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
            try VoiceWritingDraftStore.shared.remove(draftID: draftID)
            return
        }
        guard (200...299).contains(response.statusCode), payload.ok else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: response.statusCode,
                userInfo: [NSLocalizedDescriptionKey: payload.error ?? "This writing could not be deleted yet."]
            )
        }
        try VoiceWritingDraftStore.shared.remove(draftID: draftID)
    }

    func move(
        draftID: UUID,
        to destination: VoiceWritingNestDestination,
        visibility: String? = nil
    ) async throws {
        guard !movingDraftIDs.contains(draftID) else { return }
        pendingTasks[draftID]?.cancel()
        pendingTasks[draftID] = nil
        for _ in 0..<100 where syncingDraftIDs.contains(draftID) {
            try await Task.sleep(for: .milliseconds(50))
        }
        guard !syncingDraftIDs.contains(draftID) else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -3,
                userInfo: [NSLocalizedDescriptionKey: "Quipsly is finishing the last save. Try moving this writing again in a moment."]
            )
        }
        if VoiceWritingDraftStore.shared.draft(id: draftID)?.isSynced != true {
            await syncLatest(draftID: draftID)
        }
        guard let draft = VoiceWritingDraftStore.shared.draft(id: draftID),
              draft.isSynced,
              let currentProjectID = draft.canonicalProjectID?.trimmingCharacters(in: .whitespacesAndNewlines),
              !currentProjectID.isEmpty else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -4,
                userInfo: [NSLocalizedDescriptionKey: "Let this writing finish saving before moving it."]
            )
        }
        let resolvedVisibility = visibility ?? (destination.isHome ? "personal" : "nest")
        guard destination.id != currentProjectID
                || draft.canonicalVisibility != resolvedVisibility else { return }
        guard AuthManager.shared.networkActionsAllowed,
              let endpoint = URL(string: "\(nestBaseURL)/api/mobile/capture/voice-writing") else {
            throw NSError(
                domain: "QuipslyVoiceWriting",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Connect to Quipsly before moving this writing."]
            )
        }

        movingDraftIDs.insert(draftID)
        defer { movingDraftIDs.remove(draftID) }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONEncoder().encode(VoiceWritingMoveRequest(
            draftId: draft.id.uuidString.lowercased(),
            destinationProjectId: destination.id,
            expectedProjectId: currentProjectID,
            visibility: resolvedVisibility,
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

    private func syncLatest(draftID: UUID) async {
        if syncingDraftIDs.contains(draftID) {
            if let latest = VoiceWritingDraftStore.shared.draft(id: draftID) {
                schedule(latest, delay: .milliseconds(800))
            }
            return
        }
        guard AuthManager.shared.networkActionsAllowed,
              let draft = VoiceWritingDraftStore.shared.draft(id: draftID),
              !draft.isSynced else { return }
        guard let endpoint = URL(string: "\(nestBaseURL)/api/mobile/capture/voice-writing") else {
            VoiceWritingDraftStore.shared.markSyncFailed(
                draftID: draftID,
                message: "Quipsly's private writing address is invalid."
            )
            return
        }

        syncingDraftIDs.insert(draftID)
        defer { syncingDraftIDs.remove(draftID) }
        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("2", forHTTPHeaderField: "X-Quipsly-Writing-Version")
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
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Writing could not sync yet. Your device draft is safe."]
                )
            }
            VoiceWritingDraftStore.shared.markSynced(
                draftID: draftID,
                canonicalDocumentID: saved.documentId,
                serverRevision: saved.serverRevision,
                contentRevision: saved.contentRevision,
                syncedLocalRevision: saved.localRevision,
                projectID: saved.projectId,
                projectName: saved.projectName,
                projectSlug: saved.projectSlug,
                visibility: saved.visibility ?? "personal",
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
            if let returnedHomeProject = payload.homeProject {
                homeProject = returnedHomeProject
            }
            availableTags = (payload.availableTags ?? []).filter { $0.isActive != false }
            if let updatedDestinations = payload.destinations {
                destinations = updatedDestinations
            }
            if let latest = VoiceWritingDraftStore.shared.draft(id: draftID),
               !latest.isSynced {
                schedule(latest, delay: .milliseconds(250))
            }
        } catch {
            VoiceWritingDraftStore.shared.markSyncFailed(
                draftID: draftID,
                message: error.localizedDescription
            )
        }
    }

    private static func remoteDraft(from saved: VoiceWritingSyncResponse.SavedDraft) -> VoiceWritingRemoteDraft? {
        guard let draftID = UUID(uuidString: saved.draftId),
              saved.contentRevision.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else {
            return nil
        }
        let recordingID = saved.localRecordingId.flatMap(UUID.init(uuidString:))
        let transcriptID = saved.transcriptClientRequestId.flatMap(UUID.init(uuidString:))
        let formatter = ISO8601DateFormatter()
        let updatedAt = formatter.date(from: saved.updatedAt) ?? Date()
        let createdAt = saved.createdAt.flatMap(formatter.date(from:)) ?? updatedAt
        return VoiceWritingRemoteDraft(
            draftID: draftID,
            documentID: saved.documentId,
            projectID: saved.projectId,
            projectName: saved.projectName,
            projectSlug: saved.projectSlug,
            visibility: saved.visibility ?? "personal",
            title: saved.title,
            body: saved.body,
            richText: saved.richText,
            contentRevision: saved.contentRevision,
            localRevision: max(1, saved.localRevision),
            writingOrigin: saved.writingOrigin == "typed" ? "typed" : "recorded",
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
        guard let localRecordingID = saved.localRecordingId,
              let transcriptClientRequestID = saved.transcriptClientRequestId,
              let sourceSHA256 = saved.sourceSha256,
              let recordingID = UUID(uuidString: localRecordingID),
              let transcriptID = UUID(uuidString: transcriptClientRequestID),
              sourceSHA256.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else { return [] }
        return [VoiceWritingSourceReference(
            localRecordingID: recordingID,
            transcriptClientRequestID: transcriptID,
            sourceSHA256: sourceSHA256,
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
