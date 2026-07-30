import Combine
import Foundation

enum MobileSourceInboxCaptureType: String, Codable {
    case snippet = "SNIPPET"
    case bookmark = "BOOKMARK"
}

struct MobileSourceInboxSource: Codable, Identifiable, Equatable {
    let id: String
    let captureType: MobileSourceInboxCaptureType
    let title: String
    let excerpt: String
    let sourceUrl: String?
    let captureCount: Int
    let capturedAt: String
    let updatedAt: String
}

struct MobileSourceInboxDestination: Codable, Identifiable, Equatable {
    let id: String
    let slug: String
    let name: String
    let role: String
}

struct MobileSourceInboxBoundaries: Codable, Equatable {
    let actorOwnedPrivateInbox: Bool?
    let writableResearchDestinationsOnly: Bool?
    let stableFilingIdentityRequired: Bool?
    let immutableResearchSourceCreated: Bool?
    let privateCaptureMutated: Bool?
    let sourcePageImportedForBookmarks: Bool?
    let externalSideEffects: Bool?

    var preservesSourceBoundary: Bool {
        actorOwnedPrivateInbox == true
            && writableResearchDestinationsOnly == true
            && stableFilingIdentityRequired == true
            && immutableResearchSourceCreated == true
            && privateCaptureMutated == false
            && sourcePageImportedForBookmarks == false
            && externalSideEffects == false
    }
}

struct MobileSourceInboxResponse: Codable, Equatable {
    let ok: Bool
    let error: String?
    let inboxKind: String?
    let generatedAt: String?
    let sources: [MobileSourceInboxSource]?
    let destinations: [MobileSourceInboxDestination]?
    let boundaries: MobileSourceInboxBoundaries?
}

struct MobileSourceInboxFilingResponse: Codable, Equatable {
    let ok: Bool
    let code: String?
    let error: String?
    let action: String?
    let captureId: String?
    let captureType: MobileSourceInboxCaptureType?
    let projectId: String?
    let projectSlug: String?
    let projectName: String?
    let filingId: String?
    let sourceUnitId: String?
    let reused: Bool?
    let href: String?
    let boundaries: MobileSourceInboxBoundaries?
}

struct PendingSourceInboxFiling: Codable, Equatable, Identifiable {
    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let captureID: String
    let captureType: MobileSourceInboxCaptureType
    let projectID: String
    let projectName: String
    let expectedCaptureUpdatedAt: String
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String { id.uuidString.lowercased() }
}

enum SourceInboxFilingStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidDecision
    case decisionAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before filing a private source."
        case .invalidDecision:
            "Refresh the private Inbox before choosing a Research Nest."
        case .decisionAlreadyPending:
            "This private source already has a protected filing decision waiting for Nest."
        case .ledgerUnavailable:
            "The protected source-filing outbox is unavailable. Nothing was claimed as filed."
        }
    }
}

/// File-protected, account-partitioned decisions that move a private capture
/// into a canonical Research Nest without changing the private capture.
@MainActor
final class SourceInboxFilingOutbox: ObservableObject {
    static let shared = SourceInboxFilingOutbox()

    @Published private(set) var entries: [PendingSourceInboxFiling] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingSourceInboxFiling] = []
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
                .appendingPathComponent("QuipslyCapture/SourceInboxFilingOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent(
                    "Library/Application Support/QuipslyCapture/SourceInboxFilingOutbox",
                    isDirectory: true
                )
        ledgerURL = support.appendingPathComponent("source-inbox-filings-v1.json")
        lastKnownGoodURL = support.appendingPathComponent(
            "source-inbox-filings-v1.last-known-good.json"
        )

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
            persistenceError = "The protected source-filing outbox could not open: \(error.localizedDescription)"
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

    func decision(for captureID: String) -> PendingSourceInboxFiling? {
        entries.first { $0.captureID == captureID }
    }

    @discardableResult
    func enqueue(
        source: MobileSourceInboxSource,
        destination: MobileSourceInboxDestination,
        capturedAt: Date = Date()
    ) throws -> PendingSourceInboxFiling {
        guard ledgerIsWritable else { throw SourceInboxFilingStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw SourceInboxFilingStoreError.accountIdentityUnavailable
        }
        let captureID = Self.cleanID(source.id)
        let projectID = Self.cleanID(destination.id)
        let projectName = Self.cleanText(destination.name, max: 500)
        guard !captureID.isEmpty,
              !projectID.isEmpty,
              !projectName.isEmpty,
              Self.validISODate(source.updatedAt) else {
            throw SourceInboxFilingStoreError.invalidDecision
        }
        guard decision(for: captureID) == nil else {
            throw SourceInboxFilingStoreError.decisionAlreadyPending
        }

        let entry = PendingSourceInboxFiling(
            id: UUID(),
            ownerAccountID: owner,
            captureID: captureID,
            captureType: source.captureType,
            projectID: projectID,
            projectName: projectName,
            expectedCaptureUpdatedAt: source.updatedAt,
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
        var updated = storedEntries
        for index in updated.indices where entries.contains(where: { $0.id == updated[index].id }) {
            if updated[index].disposition == .held {
                updated[index].disposition = .pending
                updated[index].lastErrorCode = nil
                updated[index].lastErrorMessage = nil
            }
        }
        commitBestEffort(updated)
    }

    private func update(
        _ id: UUID,
        change: (inout PendingSourceInboxFiling) -> Void
    ) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    private func commitBestEffort(_ updated: [PendingSourceInboxFiling]) {
        do {
            try commit(updated)
        } catch {
            persistenceError = "The protected source-filing outbox could not save: \(error.localizedDescription)"
        }
    }

    private func commit(_ updated: [PendingSourceInboxFiling]) throws {
        guard ledgerIsWritable else { throw SourceInboxFilingStoreError.ledgerUnavailable }
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

    private func loadLedger() throws -> [PendingSourceInboxFiling] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do {
                return try decode(ledgerURL)
            } catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The source-filing ledger is unreadable and locked read-only. A last-known-good copy remains visible."
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

    private func decode(_ url: URL) throws -> [PendingSourceInboxFiling] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(
            [PendingSourceInboxFiling].self,
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

    nonisolated private static func cleanID(_ value: String) -> String {
        String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
    }

    nonisolated private static func cleanText(_ value: String, max: Int) -> String {
        String(
            value.replacingOccurrences(
                of: "\\s+",
                with: " ",
                options: .regularExpression
            )
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .prefix(max)
        )
    }

    nonisolated private static func validISODate(_ value: String) -> Bool {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) != nil
            || ISO8601DateFormatter().date(from: value) != nil
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let value else { return nil }
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized.isEmpty ? nil : normalized
    }
}

@MainActor
final class CaptureSourceInboxClient: ObservableObject {
    @Published private(set) var response: MobileSourceInboxResponse?
    @Published private(set) var isLoading = false
    @Published private(set) var isSyncing = false
    @Published private(set) var isUsingProtectedCache = false
    @Published private(set) var pendingCount = 0
    @Published private(set) var heldCount = 0
    @Published private(set) var lastFiledURL: URL?
    @Published var statusMessage: String?
    @Published var errorMessage: String?

    private struct ProtectedCache: Codable {
        let schemaVersion: Int
        let ownerEmail: String
        let savedAt: Date
        let response: MobileSourceInboxResponse
    }

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )
    private let outbox = SourceInboxFilingOutbox.shared
    private var isFlushing = false

    var sources: [MobileSourceInboxSource] { response?.sources ?? [] }
    var destinations: [MobileSourceInboxDestination] { response?.destinations ?? [] }

    func pendingDecision(for captureID: String) -> PendingSourceInboxFiling? {
        outbox.decision(for: captureID)
    }

    func loadPreview() {
        publishCounts()
        let now = ISO8601DateFormatter().string(from: Date())
        response = MobileSourceInboxResponse(
            ok: true,
            error: nil,
            inboxKind: "quipsly-mobile-source-inbox-v1-preview",
            generatedAt: now,
            sources: [
                MobileSourceInboxSource(
                    id: "preview-source",
                    captureType: .snippet,
                    title: "Be curious",
                    excerpt: "A preserved passage waiting for deliberate Research filing.",
                    sourceUrl: "https://example.com/source",
                    captureCount: 1,
                    capturedAt: now,
                    updatedAt: now
                ),
            ],
            destinations: [
                MobileSourceInboxDestination(
                    id: "preview-high-ground",
                    slug: "preview-high-ground",
                    name: "High Ground Odyssey",
                    role: "EDITOR"
                ),
            ],
            boundaries: MobileSourceInboxBoundaries(
                actorOwnedPrivateInbox: true,
                writableResearchDestinationsOnly: true,
                stableFilingIdentityRequired: true,
                immutableResearchSourceCreated: true,
                privateCaptureMutated: false,
                sourcePageImportedForBookmarks: false,
                externalSideEffects: false
            )
        )
        isUsingProtectedCache = false
        statusMessage = nil
        errorMessage = nil
    }

    func load() async {
        await load(flushPending: true)
    }

    @discardableResult
    func file(
        _ source: MobileSourceInboxSource,
        into destination: MobileSourceInboxDestination
    ) async -> Bool {
        do {
            let decision = try outbox.enqueue(source: source, destination: destination)
            publishCounts()
            lastFiledURL = nil
            if !AuthManager.shared.networkActionsAllowed {
                statusMessage = "Filing protected on this iPhone. Reconnect to create the canonical Research source in \(destination.name)."
                return true
            }
            let synchronized = await sync(decision)
            if synchronized {
                await load(flushPending: false)
            }
            return synchronized
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func retryHeldFilings() async {
        outbox.releaseHeldEntriesForRetry()
        publishCounts()
        _ = await flushPendingFilings()
        await load(flushPending: false)
    }

    func discardHeldFiling(for captureID: String) async {
        guard let decision = outbox.decision(for: captureID),
              decision.disposition == .held else { return }
        outbox.markAcknowledged(decision.id)
        publishCounts()
        errorMessage = nil
        statusMessage = "The phone filing decision was discarded. The private Inbox source remains unchanged."
        await load(flushPending: false)
    }

    private func load(flushPending: Bool) async {
        guard !isLoading, let url = URL(string: "\(baseURL)/api/mobile/capture/inbox") else { return }
        publishCounts()
        if response == nil {
            _ = restoreProtectedCache()
        }
        isLoading = true
        defer { isLoading = false }
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            let (data, urlResponse) = try await AuthManager.shared.authenticatedData(
                for: request,
                allowOfflineRecovery: true
            )
            let payload = try JSONDecoder().decode(MobileSourceInboxResponse.self, from: data)
            guard urlResponse.statusCode < 400,
                  payload.ok,
                  payload.inboxKind == "quipsly-mobile-source-inbox-v1",
                  payload.boundaries?.preservesSourceBoundary == true else {
                throw NSError(
                    domain: "CaptureSourceInbox",
                    code: urlResponse.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            payload.error ?? "The private source Inbox could not be verified.",
                    ]
                )
            }
            response = payload
            isUsingProtectedCache = false
            persist(payload)
            if flushPending {
                _ = await flushPendingFilings()
            }
        } catch {
            if response == nil {
                _ = restoreProtectedCache()
            }
            errorMessage = isUsingProtectedCache
                ? "Nest is unavailable. Showing a protected private Inbox snapshot; a filing choice can still be queued safely."
                : error.localizedDescription
        }
    }

    @discardableResult
    private func flushPendingFilings() async -> Bool {
        guard !isFlushing,
              AuthManager.shared.networkActionsAllowed else {
            publishCounts()
            return false
        }
        isFlushing = true
        defer {
            isFlushing = false
            publishCounts()
        }
        var synchronizedAny = false
        for decision in outbox.entries where decision.disposition == .pending {
            if await sync(decision) {
                synchronizedAny = true
            }
        }
        return synchronizedAny
    }

    private func sync(_ decision: PendingSourceInboxFiling) async -> Bool {
        guard !isSyncing,
              let url = URL(string: "\(baseURL)/api/mobile/capture/inbox") else {
            return false
        }
        isSyncing = true
        defer { isSyncing = false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "action": "file-source",
                "captureId": decision.captureID,
                "captureType": decision.captureType.rawValue,
                "projectId": decision.projectID,
                "clientRequestId": decision.clientRequestID,
                "expectedCaptureUpdatedAt": decision.expectedCaptureUpdatedAt,
            ])
            let (data, urlResponse) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileSourceInboxFilingResponse.self, from: data)
            guard urlResponse.statusCode < 400, payload.ok else {
                let message = payload.error ?? "Nest could not reconcile this Research filing."
                if urlResponse.statusCode == 408
                    || urlResponse.statusCode == 429
                    || urlResponse.statusCode >= 500 {
                    outbox.markRetryable(decision.id, message: message)
                } else {
                    outbox.markHeld(decision.id, code: payload.code, message: message)
                }
                errorMessage = message
                publishCounts()
                return false
            }
            guard payload.action == "file-source",
                  payload.captureId == decision.captureID,
                  payload.captureType == decision.captureType,
                  payload.projectId == decision.projectID,
                  payload.filingId?.isEmpty == false,
                  payload.sourceUnitId?.isEmpty == false,
                  payload.boundaries?.preservesSourceBoundary == true else {
                let message = "Nest returned a different Research filing identity. The protected phone decision is held for review."
                outbox.markHeld(
                    decision.id,
                    code: "ACKNOWLEDGEMENT_MISMATCH",
                    message: message
                )
                errorMessage = message
                publishCounts()
                return false
            }
            outbox.markAcknowledged(decision.id)
            publishCounts()
            removeAcknowledgedSource(decision.captureID)
            lastFiledURL = payload.href.flatMap { URL(string: "\(baseURL)\($0)") }
            statusMessage = payload.reused == true
                ? "Nest already had this exact source in \(payload.projectName ?? decision.projectName); nothing was duplicated."
                : "Filed into \(payload.projectName ?? decision.projectName). The private Inbox capture remains unchanged."
            errorMessage = nil
            return true
        } catch {
            let message = "Nest is unavailable. The protected filing decision will retry with the same identity."
            outbox.markRetryable(decision.id, message: message)
            errorMessage = message
            publishCounts()
            return false
        }
    }

    private func publishCounts() {
        pendingCount = outbox.pendingCount
        heldCount = outbox.heldCount
    }

    private func removeAcknowledgedSource(_ captureID: String) {
        guard let current = response else { return }
        let updated = MobileSourceInboxResponse(
            ok: current.ok,
            error: current.error,
            inboxKind: current.inboxKind,
            generatedAt: current.generatedAt,
            sources: (current.sources ?? []).filter { $0.id != captureID },
            destinations: current.destinations,
            boundaries: current.boundaries
        )
        response = updated
        persist(updated)
    }

    private var cacheURL: URL? {
        FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first?
            .appendingPathComponent("QuipslyCapture", isDirectory: true)
            .appendingPathComponent("source-inbox-v1.json")
    }

    private func persist(_ payload: MobileSourceInboxResponse) {
        guard let owner = AuthManager.currentStoredOwnerID()?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
              !owner.isEmpty,
              let url = cacheURL else { return }
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            try encoder.encode(
                ProtectedCache(
                    schemaVersion: 1,
                    ownerEmail: owner,
                    savedAt: Date(),
                    response: payload
                )
            ).write(
                to: url,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
        } catch {
            errorMessage = "The private Inbox loaded, but its protected offline snapshot could not be updated."
        }
    }

    @discardableResult
    private func restoreProtectedCache() -> Bool {
        guard let owner = AuthManager.currentStoredOwnerID()?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
              !owner.isEmpty,
              let url = cacheURL,
              let data = try? Data(contentsOf: url) else {
            return false
        }
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let cached = try decoder.decode(ProtectedCache.self, from: data)
            guard cached.schemaVersion == 1,
                  cached.ownerEmail == owner,
                  cached.response.boundaries?.preservesSourceBoundary == true else {
                return false
            }
            response = cached.response
            isUsingProtectedCache = true
            return true
        } catch {
            return false
        }
    }
}
