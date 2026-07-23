import Foundation
import Combine

struct PendingCaptureRoomReceipt: Codable, Identifiable, Equatable {
    enum Action: String, Codable {
        case start = "START_RECORDING"
        case stop = "STOP_RECORDING"
    }

    enum DeliveryDisposition: String, Codable {
        case acknowledged
        // Decode compatibility for builds that incorrectly retired an
        // ambiguous START when a local STOP existed. These rows are treated as
        // pending and replayed idempotently before their STOP.
        case supersededByStop
        case rejectedByNest
    }

    let id: UUID
    var ownerAccountID: String? = nil
    let captureID: UUID
    let sessionID: String
    let callRoomID: String
    let action: Action
    let occurredAt: Date
    var deliveryDisposition: DeliveryDisposition?
    var dispositionAt: Date?
    var terminalErrorCode: String? = nil
    var terminalErrorMessage: String? = nil

    var isPendingDelivery: Bool {
        deliveryDisposition == nil
            || (action == .start && deliveryDisposition == .supersededByStop)
    }
}

/// A small, protected outbox for app-owned room-state receipts.
///
/// Local media never depends on this outbox succeeding. The outbox exists so a
/// slow network, process suspension, or a Nest outage cannot leave a recording
/// action unaccounted for or force Quipsly to discard a healthy local take.
@MainActor
final class CaptureRoomReceiptStore: ObservableObject {
    static let shared = CaptureRoomReceiptStore()

    @Published private(set) var receipts: [PendingCaptureRoomReceipt] = []
    @Published private(set) var persistenceError: String?
    @Published private(set) var quarantinedLedgerFileName: String?

    private let fileManager: FileManager
    private let directoryURL: URL
    private let ledgerURL: URL
    private let lastKnownGoodLedgerURL: URL
    private var storedReceipts: [PendingCaptureRoomReceipt] = []
    private var ledgerIsWritable = true
    private var activeOwnerAccountID: String?
    private var accountObserver: NSObjectProtocol?

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        activeOwnerAccountID = AuthManager.currentStoredOwnerID()
        let applicationSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support", isDirectory: true)
        let directory = applicationSupport.appendingPathComponent("QuipslyCapture/Receipts", isDirectory: true)
        directoryURL = directory
        ledgerURL = directory.appendingPathComponent("room-state-outbox.json", isDirectory: false)
        lastKnownGoodLedgerURL = directory.appendingPathComponent("room-state-outbox.last-known-good.json", isDirectory: false)

        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            try? fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: directory.path
            )
            storedReceipts = try loadLedgerFailingClosed()
            publishActiveReceipts()
        } catch {
            receipts = []
            persistenceError = "The protected Nest receipt journal could not be opened: \(error.localizedDescription)"
        }

        accountObserver = NotificationCenter.default.addObserver(
            forName: .quipslyCaptureAccountIdentityDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            let ownerAccountID = notification.object as? String
            MainActor.assumeIsolated { [weak self] in
                self?.activateOwner(ownerAccountID)
            }
        }
    }

    func activateOwner(_ ownerAccountID: String?) {
        activeOwnerAccountID = normalizedOwnerID(ownerAccountID)
        publishActiveReceipts()
    }

    var pendingReceipts: [PendingCaptureRoomReceipt] {
        guard ledgerIsWritable else { return [] }
        return receipts.filter(\.isPendingDelivery)
    }

    var hasPendingReceipts: Bool {
        ledgerIsWritable && receipts.contains(where: \.isPendingDelivery)
    }

    /// Returns one deliverable boundary while preserving START -> STOP order
    /// for each capture. Excluding a capture defers only that retryable chain
    /// for the current pass, allowing unrelated STOP safety closures to advance.
    func nextDeliverableReceipt(
        excludingCaptureIDs: Set<UUID> = []
    ) -> PendingCaptureRoomReceipt? {
        let candidates = pendingReceipts.filter {
            !excludingCaptureIDs.contains($0.captureID)
        }
        return candidates.first { candidate in
            candidate.action == .start
                || !candidates.contains(where: {
                    $0.captureID == candidate.captureID && $0.action == .start
                })
        }
    }

    var latestTerminalRejectionMessage: String? {
        receipts
            .filter { $0.deliveryDisposition == .rejectedByNest }
            .sorted { ($0.dispositionAt ?? $0.occurredAt) > ($1.dispositionAt ?? $1.occurredAt) }
            .first?
            .terminalErrorMessage
    }

    @discardableResult
    func enqueue(
        captureID: UUID,
        sessionID: String,
        callRoomID: String,
        action: PendingCaptureRoomReceipt.Action,
        occurredAt: Date = Date(),
        ownerAccountID: String? = nil
    ) -> PendingCaptureRoomReceipt? {
        do {
            return try enqueueDurably(
                captureID: captureID,
                sessionID: sessionID,
                callRoomID: callRoomID,
                action: action,
                occurredAt: occurredAt,
                ownerAccountID: ownerAccountID
            )
        } catch {
            persistenceError = "The protected Nest receipt journal could not be saved: \(error.localizedDescription)"
            return nil
        }
    }

    /// Commits the room boundary before returning it. Capture startup uses this
    /// throwing API and must not open AVAudioRecorder when the write fails.
    @discardableResult
    func enqueueDurably(
        captureID: UUID,
        sessionID: String,
        callRoomID: String,
        action: PendingCaptureRoomReceipt.Action,
        occurredAt: Date = Date(),
        ownerAccountID: String? = nil
    ) throws -> PendingCaptureRoomReceipt {
        let inheritedStart = storedReceipts.first(where: {
            $0.captureID == captureID && $0.action == .start
        })
        let resolvedOwnerAccountID = normalizedOwnerID(ownerAccountID)
            ?? normalizedOwnerID(inheritedStart?.ownerAccountID)
            ?? normalizedOwnerID(activeOwnerAccountID)
        guard let resolvedOwnerAccountID else {
            throw ReceiptStoreError.accountIdentityUnavailable
        }
        if action == .stop, let inheritedStart {
            // Stop is a safety closure, not a new owner-authorized action. It
            // inherits the durable START owner even if auth expires or another
            // account becomes visible mid-take. Publication/delivery remain
            // partition-gated, so this cannot expose Account A's receipt to B.
            guard normalizedOwnerID(inheritedStart.ownerAccountID) == resolvedOwnerAccountID,
                  inheritedStart.sessionID == sessionID,
                  inheritedStart.callRoomID == callRoomID else {
                throw ReceiptStoreError.boundaryIdentityMismatch
            }
        } else {
            guard resolvedOwnerAccountID == normalizedOwnerID(activeOwnerAccountID) else {
                throw ReceiptStoreError.accountIdentityUnavailable
            }
        }

        if let existing = storedReceipts.first(where: {
            $0.captureID == captureID
                && $0.action == action
                && normalizedOwnerID($0.ownerAccountID) == resolvedOwnerAccountID
        }) {
            return existing
        }

        let receipt = PendingCaptureRoomReceipt(
            id: UUID(),
            ownerAccountID: resolvedOwnerAccountID,
            captureID: captureID,
            sessionID: sessionID,
            callRoomID: callRoomID,
            action: action,
            occurredAt: occurredAt,
            deliveryDisposition: nil,
            dispositionAt: nil
        )
        var updated = storedReceipts
        updated.append(receipt)
        try persist(updated)
        storedReceipts = updated
        publishActiveReceipts()
        return receipt
    }

    func remove(_ receiptID: UUID) {
        let visibleIDs = Set(receipts.map(\.id))
        guard visibleIDs.contains(receiptID) else { return }
        var updated = storedReceipts
        updated.removeAll { $0.id == receiptID }
        commitBestEffort(updated)
    }

    func markAcknowledged(_ receiptID: UUID, at date: Date = Date()) {
        guard receipts.contains(where: { $0.id == receiptID }),
              let index = storedReceipts.firstIndex(where: { $0.id == receiptID }) else { return }
        var updated = storedReceipts
        updated[index].deliveryDisposition = .acknowledged
        updated[index].dispositionAt = date
        commitBestEffort(updated)
    }

    func markRejectedByNest(
        _ receiptID: UUID,
        errorCode: String?,
        message: String,
        at date: Date = Date()
    ) {
        guard receipts.contains(where: { $0.id == receiptID }),
              let index = storedReceipts.firstIndex(where: { $0.id == receiptID }) else { return }
        var updated = storedReceipts
        updated[index].deliveryDisposition = .rejectedByNest
        updated[index].dispositionAt = date
        updated[index].terminalErrorCode = errorCode
        updated[index].terminalErrorMessage = message
        commitBestEffort(updated)
    }

    func completeCapture(_ captureID: UUID) {
        guard let ownerAccountID = normalizedOwnerID(activeOwnerAccountID) else { return }
        var updated = storedReceipts
        updated.removeAll {
            $0.captureID == captureID
                && normalizedOwnerID($0.ownerAccountID) == ownerAccountID
                && $0.deliveryDisposition != .rejectedByNest
        }
        commitBestEffort(updated)
    }

    /// A process death ends AVAudioRecorder. Close any start-only room boundary
    /// before replaying the outbox so Nest cannot remain incorrectly "recording."
    func closeOrphanedStarts(at date: Date = Date()) {
        let captureIDsWithStop = Set(receipts.filter { $0.action == .stop }.map(\.captureID))
        let orphanedStarts = receipts.filter {
            $0.action == .start && !captureIDsWithStop.contains($0.captureID)
        }
        for start in orphanedStarts {
            _ = enqueue(
                captureID: start.captureID,
                sessionID: start.sessionID,
                callRoomID: start.callRoomID,
                action: .stop,
                occurredAt: max(date, start.occurredAt)
            )
        }
    }

    private func commitBestEffort(_ updated: [PendingCaptureRoomReceipt]) {
        do {
            try persist(updated)
            storedReceipts = updated
            publishActiveReceipts()
        } catch {
            persistenceError = "The protected Nest receipt journal could not be saved: \(error.localizedDescription)"
        }
    }

    private func persist(_ updated: [PendingCaptureRoomReceipt]) throws {
        guard ledgerIsWritable else {
            throw ReceiptStoreError.ledgerQuarantined
        }

        let data = try JSONEncoder.captureLedger.encode(updated)
        do {
            // Per-receipt owner sidecars are independent recovery evidence. They
            // are written first so a torn aggregate write never requires owner
            // inference from a filename or the currently signed-in account.
            for receipt in updated {
                guard normalizedOwnerID(receipt.ownerAccountID) != nil else { continue }
                let receiptData = try JSONEncoder.captureLedger.encode(receipt)
                try receiptData.write(
                    to: receiptSidecarURL(receipt.id),
                    options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
                )
            }
            try data.write(to: lastKnownGoodLedgerURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            // Commit the canonical outbox last so a successful throwing API
            // return proves every recovery layer is already durable.
            try data.write(to: ledgerURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            pruneReceiptSidecars(retaining: Set(updated.map(\.id)))
            persistenceError = nil
        } catch {
            // A failed mutation is ambiguous: keep the last committed canonical
            // bytes and stop all delivery/start activity for this process. Relaunch
            // may reopen a healthy ledger; until then no resend loop or new capture
            // can advance state that cannot be journaled.
            ledgerIsWritable = false
            persistenceError = "The protected Nest receipt journal could not be saved: \(error.localizedDescription)"
            throw error
        }
    }

    private func loadLedgerFailingClosed() throws -> [PendingCaptureRoomReceipt] {
        guard fileManager.fileExists(atPath: ledgerURL.path) else {
            if let lastKnownGood = try? decodeReceiptLedger(at: lastKnownGoodLedgerURL) {
                return lastKnownGood
            }
            return loadReceiptSidecars()
        }

        do {
            return try decodeReceiptLedger(at: ledgerURL)
        } catch {
            ledgerIsWritable = false
            let formatter = ISO8601DateFormatter()
            let safeStamp = formatter.string(from: Date())
                .replacingOccurrences(of: ":", with: "-")
            let quarantineURL = directoryURL.appendingPathComponent(
                "room-state-outbox-unreadable-\(safeStamp)-\(UUID().uuidString.lowercased()).json",
                isDirectory: false
            )
            do {
                try fileManager.copyItem(at: ledgerURL, to: quarantineURL)
                quarantinedLedgerFileName = quarantineURL.lastPathComponent
            } catch {
                quarantinedLedgerFileName = ledgerURL.lastPathComponent
            }
            persistenceError = "The Nest receipt journal is unreadable and locked read-only. Its canonical bytes were preserved; capture startup is blocked until the journal is repaired."

            if let lastKnownGood = try? decodeReceiptLedger(at: lastKnownGoodLedgerURL) {
                return lastKnownGood
            }
            return loadReceiptSidecars()
        }
    }

    private func decodeReceiptLedger(at url: URL) throws -> [PendingCaptureRoomReceipt] {
        guard fileManager.fileExists(atPath: url.path) else {
            throw ReceiptStoreError.ledgerUnavailable
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder.captureLedger.decode([PendingCaptureRoomReceipt].self, from: data)
    }

    private func loadReceiptSidecars() -> [PendingCaptureRoomReceipt] {
        let urls = (try? fileManager.contentsOfDirectory(
            at: directoryURL,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        )) ?? []
        var recoveredByID: [UUID: PendingCaptureRoomReceipt] = [:]
        for url in urls where url.lastPathComponent.hasSuffix(".quipsly-receipt.json") {
            guard let data = try? Data(contentsOf: url),
                  let receipt = try? JSONDecoder.captureLedger.decode(PendingCaptureRoomReceipt.self, from: data),
                  normalizedOwnerID(receipt.ownerAccountID) != nil else {
                continue
            }
            recoveredByID[receipt.id] = receipt
        }
        return Array(recoveredByID.values)
    }

    private func receiptSidecarURL(_ receiptID: UUID) -> URL {
        directoryURL.appendingPathComponent(
            "room-state-\(receiptID.uuidString.lowercased()).quipsly-receipt.json",
            isDirectory: false
        )
    }

    private func pruneReceiptSidecars(retaining retainedIDs: Set<UUID>) {
        let urls = (try? fileManager.contentsOfDirectory(
            at: directoryURL,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        )) ?? []
        for url in urls where url.lastPathComponent.hasSuffix(".quipsly-receipt.json") {
            guard let data = try? Data(contentsOf: url),
                  let receipt = try? JSONDecoder.captureLedger.decode(PendingCaptureRoomReceipt.self, from: data),
                  !retainedIDs.contains(receipt.id) else {
                continue
            }
            // Aggregate + last-known-good are already committed. Removing only
            // this decoded sidecar prevents a completed pending STOP from being
            // resurrected if both aggregate ledgers are later damaged.
            try? fileManager.removeItem(at: url)
        }
    }

    private func publishActiveReceipts() {
        storedReceipts.sort { $0.occurredAt < $1.occurredAt }
        guard let activeOwnerAccountID = normalizedOwnerID(activeOwnerAccountID) else {
            receipts = []
            return
        }
        receipts = storedReceipts.filter {
            normalizedOwnerID($0.ownerAccountID) == activeOwnerAccountID
        }
    }

    private func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }

    private enum ReceiptStoreError: LocalizedError {
        case accountIdentityUnavailable
        case ledgerUnavailable
        case ledgerQuarantined
        case boundaryIdentityMismatch

        var errorDescription: String? {
            switch self {
            case .accountIdentityUnavailable:
                return "Verify the active Quipsly account before journaling a recording boundary."
            case .ledgerUnavailable:
                return "The protected receipt journal could not be found."
            case .ledgerQuarantined:
                return "The canonical receipt journal is quarantined read-only and will not be overwritten."
            case .boundaryIdentityMismatch:
                return "The STOP boundary does not match its durable START owner, session, and room identity."
            }
        }
    }
}

private extension JSONEncoder {
    static var captureLedger: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}

private extension JSONDecoder {
    static var captureLedger: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
