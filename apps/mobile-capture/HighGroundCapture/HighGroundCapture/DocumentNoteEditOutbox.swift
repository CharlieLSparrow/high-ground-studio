import Combine
import Foundation

struct PendingDocumentNoteEditBlock: Codable, Equatable, Identifiable {
    let id: String
    let stableId: String
    let order: Int
    let body: String
}

struct PendingDocumentNoteEdit: Codable, Equatable, Identifiable {
    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let projectID: String
    let noteID: String
    let title: String
    let blocks: [PendingDocumentNoteEditBlock]
    let expectedContentRevision: String
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String { id.uuidString.lowercased() }
}

struct DocumentNoteWorkingDraft: Codable, Equatable {
    let ownerAccountID: String
    let projectID: String
    let noteID: String
    let title: String
    let blocks: [MobileCaptureWorkNoteBlock]
    let baseContentRevision: String
    let updatedAt: Date
}

/// Continuously protects in-progress Nest note text before the person asks to
/// sync it. This is deliberately separate from the mutation outbox: a partial
/// sentence is a local working draft, while an outbox entry is an idempotent
/// request to change the canonical Nest document.
@MainActor
final class DocumentNoteWorkingDraftStore {
    static let shared = DocumentNoteWorkingDraftStore()

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedDrafts: [DocumentNoteWorkingDraft] = []
    private var activeOwnerAccountID: String?
    private var accountObserver: NSObjectProtocol?

    init(
        fileManager: FileManager = .default,
        directoryURL: URL? = nil,
        initialOwnerAccountID: String? = nil,
        observeAccountChanges: Bool = true
    ) {
        self.fileManager = fileManager
        activeOwnerAccountID = Self.normalizedOwnerID(
            initialOwnerAccountID ?? AuthManager.currentStoredOwnerID()
        )
        let support = directoryURL
            ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
                .appendingPathComponent("QuipslyCapture/DocumentNoteWorkingDrafts", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/DocumentNoteWorkingDrafts", isDirectory: true)
        ledgerURL = support.appendingPathComponent("document-note-working-drafts-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("document-note-working-drafts-v1.last-known-good.json")

        do {
            try fileManager.createDirectory(at: support, withIntermediateDirectories: true)
            try? fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: support.path
            )
            var protectedSupport = support
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            try? protectedSupport.setResourceValues(resourceValues)
            storedDrafts = try loadLedger()
        } catch {
            storedDrafts = []
        }

        if observeAccountChanges {
            accountObserver = NotificationCenter.default.addObserver(
                forName: .quipslyCaptureAccountIdentityDidChange,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                MainActor.assumeIsolated {
                    self?.activeOwnerAccountID = Self.normalizedOwnerID(notification.object as? String)
                }
            }
        }
    }

    deinit {
        if let accountObserver {
            NotificationCenter.default.removeObserver(accountObserver)
        }
    }

    func draft(for noteID: String) -> DocumentNoteWorkingDraft? {
        guard let owner = activeOwnerAccountID else { return nil }
        return storedDrafts.first {
            Self.normalizedOwnerID($0.ownerAccountID) == owner
                && $0.noteID == noteID
        }
    }

    @discardableResult
    func save(
        projectID: String,
        noteID: String,
        title: String,
        blocks: [MobileCaptureWorkNoteBlock],
        baseContentRevision: String
    ) -> Bool {
        guard let owner = activeOwnerAccountID,
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()),
              !projectID.isEmpty,
              !noteID.isEmpty,
              !blocks.isEmpty,
              blocks.count <= 24,
              Set(blocks.map(\.id)).count == blocks.count,
              Set(blocks.map(\.stableId)).count == blocks.count,
              blocks.allSatisfy({ $0.body.count <= 100_000 }),
              blocks.reduce(0, { $0 + $1.body.count }) <= 500_000,
              baseContentRevision.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else {
            return false
        }
        let draft = DocumentNoteWorkingDraft(
            ownerAccountID: owner,
            projectID: projectID,
            noteID: noteID,
            title: String(title.prefix(5_000)),
            blocks: blocks,
            baseContentRevision: baseContentRevision,
            updatedAt: Date()
        )
        var updated = storedDrafts.filter {
            !(Self.normalizedOwnerID($0.ownerAccountID) == owner && $0.noteID == noteID)
        }
        updated.append(draft)
        return commit(updated)
    }

    func remove(noteID: String) {
        guard let owner = activeOwnerAccountID else { return }
        let updated = storedDrafts.filter {
            !(Self.normalizedOwnerID($0.ownerAccountID) == owner && $0.noteID == noteID)
        }
        _ = commit(updated)
    }

    private func commit(_ updated: [DocumentNoteWorkingDraft]) -> Bool {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(updated)
            try data.write(
                to: lastKnownGoodURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            try data.write(
                to: ledgerURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            storedDrafts = updated
            return true
        } catch {
            return false
        }
    }

    private func loadLedger() throws -> [DocumentNoteWorkingDraft] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        for url in [ledgerURL, lastKnownGoodURL] where fileManager.fileExists(atPath: url.path) {
            if let data = try? Data(contentsOf: url),
               let drafts = try? decoder.decode([DocumentNoteWorkingDraft].self, from: data) {
                return drafts
            }
        }
        return []
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }
}

enum DocumentNoteEditStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidEdit
    case editAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before editing a project note."
        case .invalidEdit:
            "Refresh this project note before protecting an edit."
        case .editAlreadyPending:
            "This note already has a protected device edit waiting for Nest."
        case .ledgerUnavailable:
            "The protected project-note edit outbox is unavailable. Nothing was claimed as changed."
        }
    }
}

/// File-protected, actor-partitioned edits to canonical StudioDocument notes.
///
/// The exact title, stable block identities, bodies, and content fingerprint
/// are durable before Capture claims an offline save. One request UUID remains
/// bound to that complete intent across process death and ambiguous retries.
@MainActor
final class DocumentNoteEditOutbox: ObservableObject {
    static let shared = DocumentNoteEditOutbox()

    @Published private(set) var entries: [PendingDocumentNoteEdit] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingDocumentNoteEdit] = []
    private var activeOwnerAccountID: String?
    private var ledgerIsWritable = true
    private var accountObserver: NSObjectProtocol?

    init(
        fileManager: FileManager = .default,
        directoryURL: URL? = nil,
        initialOwnerAccountID: String? = nil,
        observeAccountChanges: Bool = true
    ) {
        self.fileManager = fileManager
        activeOwnerAccountID = Self.normalizedOwnerID(
            initialOwnerAccountID ?? AuthManager.currentStoredOwnerID()
        )
        let support = directoryURL
            ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
                .appendingPathComponent("QuipslyCapture/DocumentNoteEditOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/DocumentNoteEditOutbox", isDirectory: true)
        ledgerURL = support.appendingPathComponent("document-note-edits-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("document-note-edits-v1.last-known-good.json")

        do {
            try fileManager.createDirectory(at: support, withIntermediateDirectories: true)
            try? fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: support.path
            )
            var protectedSupport = support
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            try? protectedSupport.setResourceValues(resourceValues)
            storedEntries = try loadLedger()
            publish()
        } catch {
            ledgerIsWritable = false
            persistenceError = "The protected project-note edit outbox could not open: \(error.localizedDescription)"
        }

        if observeAccountChanges {
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
    }

    var pendingCount: Int { entries.filter { $0.disposition == .pending }.count }
    var heldCount: Int { entries.filter { $0.disposition == .held }.count }

    func activateOwner(_ ownerAccountID: String?) {
        activeOwnerAccountID = Self.normalizedOwnerID(ownerAccountID)
        publish()
    }

    func edit(for noteID: String) -> PendingDocumentNoteEdit? {
        entries.first { $0.noteID == noteID }
    }

    @discardableResult
    func enqueue(
        projectID: String,
        noteID: String,
        title: String,
        blocks: [MobileCaptureWorkNoteBlock],
        expectedContentRevision: String,
        replacingHeld: Bool = false,
        capturedAt: Date = Date()
    ) throws -> PendingDocumentNoteEdit {
        guard ledgerIsWritable else { throw DocumentNoteEditStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw DocumentNoteEditStoreError.accountIdentityUnavailable
        }

        let cleanProjectID = Self.cleanID(projectID)
        let cleanNoteID = Self.cleanID(noteID)
        let cleanTitle = title
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        let cleanRevision = Self.cleanID(expectedContentRevision, max: 64).lowercased()
        let cleanBlocks = blocks.prefix(24).map {
            PendingDocumentNoteEditBlock(
                id: Self.cleanID($0.id),
                stableId: Self.cleanID($0.stableId),
                order: $0.order,
                body: $0.body
                    .replacingOccurrences(of: "\r\n", with: "\n")
                    .replacingOccurrences(of: "\r", with: "\n")
            )
        }
        let totalLength = cleanBlocks.reduce(0) { $0 + $1.body.count }
        guard !cleanProjectID.isEmpty,
              !cleanNoteID.isEmpty,
              !cleanTitle.isEmpty,
              cleanTitle.count <= 160,
              cleanRevision.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
              cleanBlocks.count == blocks.count,
              !cleanBlocks.isEmpty,
              Set(cleanBlocks.map(\.id)).count == cleanBlocks.count,
              Set(cleanBlocks.map(\.stableId)).count == cleanBlocks.count,
              cleanBlocks.allSatisfy({
                  !$0.id.isEmpty
                      && !$0.stableId.isEmpty
                      && $0.body.count <= 20_000
              }),
              cleanBlocks.contains(where: { !$0.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }),
              totalLength <= 60_000 else {
            throw DocumentNoteEditStoreError.invalidEdit
        }

        let existing = edit(for: cleanNoteID)
        guard existing == nil || replacingHeld && existing?.disposition == .held else {
            throw DocumentNoteEditStoreError.editAlreadyPending
        }
        let entry = PendingDocumentNoteEdit(
            id: UUID(),
            ownerAccountID: owner,
            projectID: cleanProjectID,
            noteID: cleanNoteID,
            title: cleanTitle,
            blocks: cleanBlocks,
            expectedContentRevision: cleanRevision,
            capturedAt: capturedAt,
            disposition: .pending,
            attemptCount: 0,
            lastAttemptAt: nil,
            lastErrorCode: nil,
            lastErrorMessage: nil
        )
        var updated = storedEntries
        if replacingHeld {
            updated.removeAll {
                Self.normalizedOwnerID($0.ownerAccountID) == owner
                    && $0.noteID == cleanNoteID
            }
        }
        updated.append(entry)
        try commit(updated)
        return entry
    }

    func markAcknowledged(_ id: UUID) {
        var updated = storedEntries
        updated.removeAll { $0.id == id }
        commitBestEffort(updated)
    }

    func markRetryable(_ id: UUID, message: String, at date: Date = Date()) {
        update(id) { entry in
            entry.disposition = .pending
            entry.attemptCount += 1
            entry.lastAttemptAt = date
            entry.lastErrorCode = nil
            entry.lastErrorMessage = message
        }
    }

    func markHeld(_ id: UUID, code: String?, message: String, at date: Date = Date()) {
        update(id) { entry in
            entry.disposition = .held
            entry.attemptCount += 1
            entry.lastAttemptAt = date
            entry.lastErrorCode = code
            entry.lastErrorMessage = message
        }
    }

    func discard(noteID: String) {
        guard let owner = activeOwnerAccountID else { return }
        var updated = storedEntries
        updated.removeAll {
            Self.normalizedOwnerID($0.ownerAccountID) == owner
                && $0.noteID == noteID
        }
        commitBestEffort(updated)
    }

    private func update(
        _ id: UUID,
        change: (inout PendingDocumentNoteEdit) -> Void
    ) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    private func commitBestEffort(_ updated: [PendingDocumentNoteEdit]) {
        do {
            try commit(updated)
        } catch {
            persistenceError = "The protected project-note edit outbox could not save: \(error.localizedDescription)"
        }
    }

    private func commit(_ updated: [PendingDocumentNoteEdit]) throws {
        guard ledgerIsWritable else { throw DocumentNoteEditStoreError.ledgerUnavailable }
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(updated)
            try data.write(
                to: lastKnownGoodURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            try data.write(
                to: ledgerURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            storedEntries = updated
            persistenceError = nil
            publish()
        } catch {
            ledgerIsWritable = false
            throw error
        }
    }

    private func loadLedger() throws -> [PendingDocumentNoteEdit] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do {
                return try decode(ledgerURL)
            } catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The project-note edit ledger is unreadable and locked read-only. A last-known-good copy remains visible."
                    return recovered
                }
                throw error
            }
        }
        if fileManager.fileExists(atPath: lastKnownGoodURL.path),
           let recovered = try? decode(lastKnownGoodURL) {
            return recovered
        }
        return []
    }

    private func decode(_ url: URL) throws -> [PendingDocumentNoteEdit] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(
            [PendingDocumentNoteEdit].self,
            from: Data(contentsOf: url)
        )
    }

    private func publish() {
        storedEntries.sort { $0.capturedAt < $1.capturedAt }
        guard let owner = activeOwnerAccountID else {
            entries = []
            return
        }
        entries = storedEntries.filter {
            Self.normalizedOwnerID($0.ownerAccountID) == owner
        }
    }

    nonisolated private static func cleanID(_ value: String, max: Int = 200) -> String {
        String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(max))
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
              !normalized.isEmpty,
              normalized.count <= 256 else {
            return nil
        }
        return normalized
    }
}
