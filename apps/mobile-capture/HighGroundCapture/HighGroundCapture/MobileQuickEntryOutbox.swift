import Foundation
import Combine

enum MobileQuickEntryKind: String, Codable, CaseIterable, Identifiable {
    case note = "NOTE"
    case task = "TASK"
    case goal = "GOAL"
    case source = "SOURCE"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .note: "Note"
        case .task: "Task"
        case .goal: "Goal"
        case .source: "Source"
        }
    }

    var systemImage: String {
        switch self {
        case .note: "note.text.badge.plus"
        case .task: "checklist"
        case .goal: "target"
        case .source: "link.badge.plus"
        }
    }
}

struct MobileQuickEntryRecurrence: Codable, Equatable {
    let cadence: String
    let frequency: String
    let interval: Int
    let timezone: String
    let localTimeMinutes: Int
    let anchorLocalDate: String
}

struct PendingMobileQuickEntry: Codable, Identifiable, Equatable {
    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let sessionID: String?
    let callRoomID: String?
    let sessionTitle: String?
    let kind: MobileQuickEntryKind
    let title: String?
    let body: String
    let sourceURL: String?
    let tagIDs: [String]?
    let recurrence: MobileQuickEntryRecurrence?
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String { id.uuidString.lowercased() }

    var displayTitle: String {
        let cleanTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !cleanTitle.isEmpty { return cleanTitle }
        let cleanBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleanBody.isEmpty ? "Untitled \(kind.title.lowercased())" : String(cleanBody.prefix(80))
    }
}

enum MobileQuickEntryStoreError: LocalizedError {
    case accountIdentityUnavailable
    case emptyContent
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before saving this quick capture."
        case .emptyContent:
            "Write the note, task, goal, or source before saving it."
        case .ledgerUnavailable:
            "The protected quick-capture outbox is unavailable. Nothing was claimed as saved."
        }
    }
}

/// Protected actor-partitioned outbox for small, explicit Session entries.
///
/// Saving to this ledger is the iPhone success boundary. Nest delivery can be
/// retried with the same UUID, so a timeout or process death never requires a
/// second canonical Note, Task, Goal, Snippet, or Bookmark.
@MainActor
final class MobileQuickEntryOutbox: ObservableObject {
    static let shared = MobileQuickEntryOutbox()

    @Published private(set) var entries: [PendingMobileQuickEntry] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let directoryURL: URL
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingMobileQuickEntry] = []
    private var activeOwnerAccountID: String?
    private var ledgerIsWritable = true
    private var accountObserver: NSObjectProtocol?

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        activeOwnerAccountID = Self.normalizedOwnerID(AuthManager.currentStoredOwnerID())
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support", isDirectory: true)
        directoryURL = support.appendingPathComponent("QuipslyCapture/QuickEntryOutbox", isDirectory: true)
        ledgerURL = directoryURL.appendingPathComponent("quick-entry-outbox-v1.json")
        lastKnownGoodURL = directoryURL.appendingPathComponent("quick-entry-outbox-v1.last-known-good.json")

        do {
            try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            try? fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: directoryURL.path
            )
            storedEntries = try loadLedger()
            publishActiveEntries()
        } catch {
            ledgerIsWritable = false
            persistenceError = "The protected quick-capture outbox could not open: \(error.localizedDescription)"
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

    var pendingCount: Int { entries.filter { $0.disposition == .pending }.count }
    var heldCount: Int { entries.filter { $0.disposition == .held }.count }
    var hasRetryableEntries: Bool { !entries.isEmpty && ledgerIsWritable }

    func activateOwner(_ ownerAccountID: String?) {
        activeOwnerAccountID = Self.normalizedOwnerID(ownerAccountID)
        publishActiveEntries()
    }

    @discardableResult
    func enqueue(
        kind: MobileQuickEntryKind,
        session: MobileCaptureSession?,
        title: String?,
        body: String,
        sourceURL: String? = nil,
        tagIDs: [String] = [],
        recurrence: MobileQuickEntryRecurrence? = nil,
        capturedAt: Date = Date()
    ) throws -> PendingMobileQuickEntry {
        guard ledgerIsWritable else { throw MobileQuickEntryStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw MobileQuickEntryStoreError.accountIdentityUnavailable
        }
        let cleanTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard kind == .source
            ? !cleanBody.isEmpty
            : kind == .note
                ? !cleanBody.isEmpty
                : !(cleanTitle ?? "").isEmpty else {
            throw MobileQuickEntryStoreError.emptyContent
        }
        guard kind == .source || session != nil else {
            throw MobileQuickEntryStoreError.emptyContent
        }
        guard recurrence == nil || kind == .task else {
            throw MobileQuickEntryStoreError.emptyContent
        }

        let entry = PendingMobileQuickEntry(
            id: UUID(),
            ownerAccountID: owner,
            sessionID: session?.id,
            callRoomID: session?.callRoomId,
            sessionTitle: session?.displayTitle,
            kind: kind,
            title: cleanTitle?.isEmpty == false ? cleanTitle : nil,
            body: cleanBody,
            sourceURL: sourceURL.flatMap(Self.normalizedHTTPURL),
            tagIDs: Array(Set(tagIDs.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })).sorted(),
            recurrence: recurrence,
            capturedAt: capturedAt,
            disposition: .pending,
            attemptCount: 0,
            lastAttemptAt: nil,
            lastErrorCode: nil,
            lastErrorMessage: nil
        )
        var updated = storedEntries
        updated.append(entry)
        try commit(updated)
        return entry
    }

    func markAcknowledged(_ id: UUID) {
        guard entries.contains(where: { $0.id == id }) else { return }
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

    func releaseHeldEntriesForRetry() {
        let visibleIDs = Set(entries.map(\.id))
        var updated = storedEntries
        for index in updated.indices where visibleIDs.contains(updated[index].id) {
            updated[index].disposition = .pending
        }
        commitBestEffort(updated)
    }

    /// Moves account-bound Share Extension envelopes into the protected app
    /// outbox before network replay. An envelope for any other account remains
    /// sealed in the shared container and is never published to this actor.
    @discardableResult
    func importShareExtensionCaptures() -> Int {
        guard ledgerIsWritable,
              let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()),
              let directory = ShareCaptureBridge.sharedInboxDirectory(fileManager: fileManager) else { return 0 }

        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            try? fileManager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
            let files = try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles])
                .filter { $0.pathExtension == "json" }
                .sorted { $0.lastPathComponent < $1.lastPathComponent }
                .prefix(100)
            var updated = storedEntries
            var consumed: [URL] = []

            for file in files {
                let values = try? file.resourceValues(forKeys: [.fileSizeKey])
                guard (values?.fileSize ?? 0) <= 128_000,
                      let data = try? Data(contentsOf: file),
                      let envelope = try? Self.shareDecoder.decode(SharedSourceCaptureEnvelope.self, from: data),
                      ["quipsly-share-source-capture-v1", "quipsly-share-source-capture-v2"].contains(envelope.schema),
                      Self.normalizedOwnerID(envelope.ownerAccountID) == owner else { continue }
                let body = envelope.body.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !body.isEmpty, body.count <= 20_000 else { continue }
                let cleanTitle = envelope.title?.trimmingCharacters(in: .whitespacesAndNewlines)
                let sourceURL = envelope.sourceURL.flatMap(Self.normalizedHTTPURL)
                if envelope.sourceURL?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false,
                   sourceURL == nil { continue }
                if !updated.contains(where: { $0.id == envelope.id }) {
                    updated.append(PendingMobileQuickEntry(
                        id: envelope.id,
                        ownerAccountID: owner,
                        sessionID: nil,
                        callRoomID: nil,
                        sessionTitle: nil,
                        kind: .source,
                        title: cleanTitle?.isEmpty == false ? cleanTitle : nil,
                        body: body,
                        sourceURL: sourceURL,
                        tagIDs: nil,
                        recurrence: nil,
                        capturedAt: envelope.capturedAt,
                        disposition: .pending,
                        attemptCount: 0,
                        lastAttemptAt: nil,
                        lastErrorCode: nil,
                        lastErrorMessage: nil
                    ))
                }
                consumed.append(file)
            }
            guard !consumed.isEmpty else { return 0 }
            try commit(updated)
            for file in consumed { try? fileManager.removeItem(at: file) }
            return consumed.count
        } catch {
            persistenceError = "Shared source capture is still protected but could not enter the app outbox: \(error.localizedDescription)"
            return 0
        }
    }

    private func update(_ id: UUID, change: (inout PendingMobileQuickEntry) -> Void) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    private func commitBestEffort(_ updated: [PendingMobileQuickEntry]) {
        do { try commit(updated) }
        catch { persistenceError = "The protected quick-capture outbox could not save: \(error.localizedDescription)" }
    }

    private func commit(_ updated: [PendingMobileQuickEntry]) throws {
        guard ledgerIsWritable else { throw MobileQuickEntryStoreError.ledgerUnavailable }
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(updated)
            try data.write(to: lastKnownGoodURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            try data.write(to: ledgerURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            storedEntries = updated
            persistenceError = nil
            publishActiveEntries()
        } catch {
            ledgerIsWritable = false
            throw error
        }
    }

    private func loadLedger() throws -> [PendingMobileQuickEntry] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do { return try decode(ledgerURL) }
            catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The quick-capture ledger is unreadable and locked read-only. A last-known-good copy remains visible."
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

    private func decode(_ url: URL) throws -> [PendingMobileQuickEntry] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([PendingMobileQuickEntry].self, from: Data(contentsOf: url))
    }

    private func publishActiveEntries() {
        storedEntries.sort { $0.capturedAt < $1.capturedAt }
        guard let activeOwnerAccountID = Self.normalizedOwnerID(activeOwnerAccountID) else {
            entries = []
            return
        }
        entries = storedEntries.filter { Self.normalizedOwnerID($0.ownerAccountID) == activeOwnerAccountID }
    }

    private static let shareDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty,
              value.count <= 256 else { return nil }
        return value
    }

    nonisolated private static func normalizedHTTPURL(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count <= 20_000,
              let url = URL(string: trimmed),
              ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return nil }
        return url.absoluteString
    }
}
