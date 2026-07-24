import Combine
import Foundation

struct PendingSessionNoteEdit: Codable, Equatable, Identifiable {
    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let roomID: String
    let noteID: String
    let title: String?
    let body: String
    let noteKind: MobileSessionNoteKind
    let noteVisibility: MobileSessionNoteVisibility
    let tagIDs: [String]
    let expectedUpdatedAt: String
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String { id.uuidString.lowercased() }
}

enum SessionNoteEditStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidEdit
    case editAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before editing a Session note."
        case .invalidEdit:
            "Refresh the Session before saving this note draft."
        case .editAlreadyPending:
            "This note already has a protected iPhone edit waiting for Nest."
        case .ledgerUnavailable:
            "The protected Session-note edit outbox is unavailable. Nothing was claimed as changed."
        }
    }
}

/// File-protected, actor-partitioned canonical Session-note edits.
///
/// The complete desired content, audience, purpose, tags, and expected Nest
/// revision are durable before the UI claims an offline edit. One UUID remains
/// bound to the exact intent across ambiguous retries.
@MainActor
final class SessionNoteEditOutbox: ObservableObject {
    static let shared = SessionNoteEditOutbox()

    @Published private(set) var entries: [PendingSessionNoteEdit] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingSessionNoteEdit] = []
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
                .appendingPathComponent("QuipslyCapture/SessionNoteEditOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/SessionNoteEditOutbox", isDirectory: true)
        ledgerURL = support.appendingPathComponent("session-note-edits-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("session-note-edits-v1.last-known-good.json")

        do {
            try fileManager.createDirectory(at: support, withIntermediateDirectories: true)
            try? fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: support.path
            )
            storedEntries = try loadLedger()
            publish()
        } catch {
            ledgerIsWritable = false
            persistenceError = "The protected Session-note edit outbox could not open: \(error.localizedDescription)"
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

    func edit(for noteID: String) -> PendingSessionNoteEdit? {
        entries.first { $0.noteID == noteID }
    }

    @discardableResult
    func enqueue(
        roomID: String,
        noteID: String,
        title: String?,
        body: String,
        noteKind: MobileSessionNoteKind,
        noteVisibility: MobileSessionNoteVisibility,
        tagIDs: [String],
        expectedUpdatedAt: String,
        replacingHeld: Bool = false,
        capturedAt: Date = Date()
    ) throws -> PendingSessionNoteEdit {
        guard ledgerIsWritable else { throw SessionNoteEditStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw SessionNoteEditStoreError.accountIdentityUnavailable
        }
        let cleanRoomID = Self.cleanID(roomID)
        let cleanNoteID = Self.cleanID(noteID)
        let cleanTitle = title.map {
            String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        }
        let cleanBody = String(body.trimmingCharacters(in: .whitespacesAndNewlines).prefix(20_000))
        let cleanTagIDs = Array(Set(tagIDs.map(Self.cleanID).filter { !$0.isEmpty })).sorted()
        guard !cleanRoomID.isEmpty,
              !cleanNoteID.isEmpty,
              !cleanBody.isEmpty,
              !expectedUpdatedAt.isEmpty,
              cleanTagIDs.count == tagIDs.count,
              cleanTagIDs.count <= 24 else {
            throw SessionNoteEditStoreError.invalidEdit
        }
        let existing = edit(for: cleanNoteID)
        guard existing == nil || replacingHeld && existing?.disposition == .held else {
            throw SessionNoteEditStoreError.editAlreadyPending
        }

        let entry = PendingSessionNoteEdit(
            id: UUID(),
            ownerAccountID: owner,
            roomID: cleanRoomID,
            noteID: cleanNoteID,
            title: cleanTitle?.isEmpty == false ? cleanTitle : nil,
            body: cleanBody,
            noteKind: noteKind,
            noteVisibility: noteVisibility,
            tagIDs: cleanTagIDs,
            expectedUpdatedAt: expectedUpdatedAt,
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
                Self.normalizedOwnerID($0.ownerAccountID) == owner && $0.noteID == cleanNoteID
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
            Self.normalizedOwnerID($0.ownerAccountID) == owner && $0.noteID == noteID
        }
        commitBestEffort(updated)
    }

    private func update(
        _ id: UUID,
        change: (inout PendingSessionNoteEdit) -> Void
    ) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    private func commitBestEffort(_ updated: [PendingSessionNoteEdit]) {
        do { try commit(updated) }
        catch {
            persistenceError = "The protected Session-note edit outbox could not save: \(error.localizedDescription)"
        }
    }

    private func commit(_ updated: [PendingSessionNoteEdit]) throws {
        guard ledgerIsWritable else { throw SessionNoteEditStoreError.ledgerUnavailable }
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

    private func loadLedger() throws -> [PendingSessionNoteEdit] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do { return try decode(ledgerURL) }
            catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The Session-note edit ledger is unreadable and locked read-only. A last-known-good copy remains visible."
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

    private func decode(_ url: URL) throws -> [PendingSessionNoteEdit] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([PendingSessionNoteEdit].self, from: Data(contentsOf: url))
    }

    private func publish() {
        storedEntries.sort { $0.capturedAt < $1.capturedAt }
        guard let owner = activeOwnerAccountID else {
            entries = []
            return
        }
        entries = storedEntries.filter { Self.normalizedOwnerID($0.ownerAccountID) == owner }
    }

    nonisolated private static func cleanID(_ value: String) -> String {
        String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }
}
