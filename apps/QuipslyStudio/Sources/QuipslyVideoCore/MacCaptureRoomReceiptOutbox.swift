import Foundation

#if os(macOS)
public struct MacCaptureRoomReceipt:
    Codable,
    Equatable,
    Identifiable,
    Sendable
{
    public enum Action: String, Codable, Sendable {
        case start = "START_RECORDING"
        case stop = "STOP_RECORDING"
    }

    public enum DeliveryDisposition: String, Codable, Sendable {
        case acknowledged
        case rejectedByNest = "rejected-by-nest"
    }

    public let protocolVersion: Int
    public let id: UUID
    public let ownerAccountID: String
    public let captureID: UUID
    public let sessionID: String
    public let callRoomID: String
    public let action: Action
    public let occurredAt: Date
    public var deliveryDisposition: DeliveryDisposition?
    public var dispositionAt: Date?
    public var serverStateApplied: Bool?
    public var terminalErrorCode: String?
    public var terminalErrorMessage: String?

    public init(
        id: UUID = UUID(),
        ownerAccountID: String,
        captureID: UUID,
        sessionID: String,
        callRoomID: String,
        action: Action,
        occurredAt: Date = Date(),
        deliveryDisposition: DeliveryDisposition? = nil,
        dispositionAt: Date? = nil,
        serverStateApplied: Bool? = nil,
        terminalErrorCode: String? = nil,
        terminalErrorMessage: String? = nil
    ) {
        self.protocolVersion = 1
        self.id = id
        self.ownerAccountID = ownerAccountID
        self.captureID = captureID
        self.sessionID = sessionID
        self.callRoomID = callRoomID
        self.action = action
        self.occurredAt = occurredAt
        self.deliveryDisposition = deliveryDisposition
        self.dispositionAt = dispositionAt
        self.serverStateApplied = serverStateApplied
        self.terminalErrorCode = terminalErrorCode
        self.terminalErrorMessage = terminalErrorMessage
    }

    public var isPendingDelivery: Bool {
        deliveryDisposition == nil
    }
}

public struct MacCaptureRoomStateResponse:
    Codable,
    Equatable,
    Sendable
{
    public let ok: Bool
    public let error: String?
    public let receiptPersisted: Bool?
    public let stateApplied: Bool?
    public let idempotentReplay: Bool?
    public let errorCode: String?

    public init(
        ok: Bool,
        error: String? = nil,
        receiptPersisted: Bool? = nil,
        stateApplied: Bool? = nil,
        idempotentReplay: Bool? = nil,
        errorCode: String? = nil
    ) {
        self.ok = ok
        self.error = error
        self.receiptPersisted = receiptPersisted
        self.stateApplied = stateApplied
        self.idempotentReplay = idempotentReplay
        self.errorCode = errorCode
    }
}

public enum MacCaptureRoomReceiptOutboxError:
    LocalizedError,
    Equatable
{
    case ownerIdentityUnavailable
    case invalidRoomIdentity
    case stopWithoutMatchingStart
    case boundaryIdentityMismatch
    case ledgerQuarantined

    public var errorDescription: String? {
        switch self {
        case .ownerIdentityUnavailable:
            "Verify the server-returned Quipsly account before journaling a recording boundary."
        case .invalidRoomIdentity:
            "The Episode Room receipt is missing its stable session or call-room identity."
        case .stopWithoutMatchingStart:
            "Quipsly will not create a STOP without the matching durable START receipt."
        case .boundaryIdentityMismatch:
            "The STOP boundary does not match its START owner, session, and call-room identity."
        case .ledgerQuarantined:
            "The room-receipt outbox is quarantined read-only. Its existing bytes were preserved."
        }
    }
}

@MainActor
public final class MacCaptureRoomReceiptOutbox {
    public private(set) var receipts: [MacCaptureRoomReceipt] = []
    public private(set) var persistenceError: String?
    public private(set) var quarantinedLedgerURL: URL?
    public private(set) var isWritable = true

    public let directoryURL: URL
    public let ledgerURL: URL
    public let lastKnownGoodLedgerURL: URL

    private let fileManager: FileManager

    public init(
        fileManager: FileManager = .default,
        rootDirectory: URL? = nil
    ) {
        self.fileManager = fileManager
        let applicationSupport =
            rootDirectory
                ?? fileManager.urls(
                    for: .applicationSupportDirectory,
                    in: .userDomainMask
                ).first
                ?? URL(fileURLWithPath: NSHomeDirectory())
                    .appendingPathComponent(
                        "Library/Application Support",
                        isDirectory: true
                    )
        directoryURL = applicationSupport
            .appendingPathComponent(
                "QuipslyStudio/CaptureControl",
                isDirectory: true
            )
        ledgerURL = directoryURL.appendingPathComponent(
            "room-state-outbox.json"
        )
        lastKnownGoodLedgerURL = directoryURL.appendingPathComponent(
            "room-state-outbox.last-known-good.json"
        )

        do {
            try fileManager.createDirectory(
                at: directoryURL,
                withIntermediateDirectories: true
            )
            receipts = try loadLedgerFailingClosed()
            sortReceipts()
        } catch {
            isWritable = false
            persistenceError =
                "The Nest room-receipt outbox could not be opened: \(error.localizedDescription)"
        }
    }

    public func pendingReceipts(
        ownerAccountID: String
    ) -> [MacCaptureRoomReceipt] {
        guard isWritable,
              let owner = normalizedOwner(ownerAccountID) else {
            return []
        }
        return receipts
            .filter {
                $0.ownerAccountID == owner && $0.isPendingDelivery
            }
            .sorted { lhs, rhs in
                if lhs.captureID == rhs.captureID,
                   lhs.action != rhs.action {
                    return lhs.action == .start
                }
                if lhs.occurredAt != rhs.occurredAt {
                    return lhs.occurredAt < rhs.occurredAt
                }
                return lhs.id.uuidString < rhs.id.uuidString
            }
    }

    @discardableResult
    public func enqueueStart(
        ownerAccountID: String,
        captureID: UUID,
        sessionID: String,
        callRoomID: String,
        occurredAt: Date = Date()
    ) throws -> MacCaptureRoomReceipt {
        let owner = try requiredIdentity(ownerAccountID)
        let session = try requiredRoomIdentity(sessionID)
        let room = try requiredRoomIdentity(callRoomID)
        if let existing = receipts.first(where: {
            $0.ownerAccountID == owner
                && $0.captureID == captureID
                && $0.action == .start
        }) {
            guard existing.sessionID == session,
                  existing.callRoomID == room else {
                throw MacCaptureRoomReceiptOutboxError
                    .boundaryIdentityMismatch
            }
            return existing
        }
        let receipt = MacCaptureRoomReceipt(
            ownerAccountID: owner,
            captureID: captureID,
            sessionID: session,
            callRoomID: room,
            action: .start,
            occurredAt: occurredAt
        )
        try commit(receipts + [receipt])
        return receipt
    }

    @discardableResult
    public func enqueueStop(
        ownerAccountID: String,
        captureID: UUID,
        sessionID: String,
        callRoomID: String,
        occurredAt: Date = Date()
    ) throws -> MacCaptureRoomReceipt {
        let owner = try requiredIdentity(ownerAccountID)
        let session = try requiredRoomIdentity(sessionID)
        let room = try requiredRoomIdentity(callRoomID)
        guard let start = receipts.first(where: {
            $0.ownerAccountID == owner
                && $0.captureID == captureID
                && $0.action == .start
        }) else {
            throw MacCaptureRoomReceiptOutboxError
                .stopWithoutMatchingStart
        }
        guard start.sessionID == session,
              start.callRoomID == room else {
            throw MacCaptureRoomReceiptOutboxError
                .boundaryIdentityMismatch
        }
        if let existing = receipts.first(where: {
            $0.ownerAccountID == owner
                && $0.captureID == captureID
                && $0.action == .stop
        }) {
            return existing
        }
        let receipt = MacCaptureRoomReceipt(
            ownerAccountID: owner,
            captureID: captureID,
            sessionID: session,
            callRoomID: room,
            action: .stop,
            occurredAt: max(occurredAt, start.occurredAt)
        )
        try commit(receipts + [receipt])
        return receipt
    }

    @discardableResult
    public func closeOrphanedStarts(
        ownerAccountID: String,
        at date: Date = Date()
    ) throws -> [MacCaptureRoomReceipt] {
        let owner = try requiredIdentity(ownerAccountID)
        let stoppedCaptureIDs = Set(
            receipts
                .filter {
                    $0.ownerAccountID == owner && $0.action == .stop
                }
                .map(\.captureID)
        )
        let orphaned = receipts.filter {
            $0.ownerAccountID == owner
                && $0.action == .start
                && $0.deliveryDisposition != .rejectedByNest
                && !stoppedCaptureIDs.contains($0.captureID)
        }
        return try orphaned.map {
            try enqueueStop(
                ownerAccountID: owner,
                captureID: $0.captureID,
                sessionID: $0.sessionID,
                callRoomID: $0.callRoomID,
                occurredAt: max(date, $0.occurredAt)
            )
        }
    }

    public func markAcknowledged(
        _ receiptID: UUID,
        stateApplied: Bool,
        at date: Date = Date()
    ) throws {
        guard let index = receipts.firstIndex(where: {
            $0.id == receiptID
        }) else { return }
        var updated = receipts
        updated[index].deliveryDisposition = .acknowledged
        updated[index].dispositionAt = date
        updated[index].serverStateApplied = stateApplied
        updated[index].terminalErrorCode = nil
        updated[index].terminalErrorMessage = nil
        try commit(updated)
    }

    public func markRejectedByNest(
        _ receiptID: UUID,
        errorCode: String?,
        message: String,
        at date: Date = Date()
    ) throws {
        guard let index = receipts.firstIndex(where: {
            $0.id == receiptID
        }) else { return }
        var updated = receipts
        updated[index].deliveryDisposition = .rejectedByNest
        updated[index].dispositionAt = date
        updated[index].serverStateApplied = false
        updated[index].terminalErrorCode = errorCode
        updated[index].terminalErrorMessage = message
        try commit(updated)
    }

    private func commit(
        _ updated: [MacCaptureRoomReceipt]
    ) throws {
        guard isWritable else {
            throw MacCaptureRoomReceiptOutboxError.ledgerQuarantined
        }
        let data = try Self.encoder.encode(updated)
        do {
            for receipt in updated {
                let receiptData = try Self.encoder.encode(receipt)
                try receiptData.write(
                    to: sidecarURL(receipt.id),
                    options: .atomic
                )
            }
            try data.write(
                to: lastKnownGoodLedgerURL,
                options: .atomic
            )
            try data.write(to: ledgerURL, options: .atomic)
            receipts = updated
            sortReceipts()
            pruneSidecars(retaining: Set(updated.map(\.id)))
            persistenceError = nil
        } catch {
            isWritable = false
            persistenceError =
                "The Nest room-receipt outbox could not be saved and is locked for this process: \(error.localizedDescription)"
            throw error
        }
    }

    private func loadLedgerFailingClosed() throws
        -> [MacCaptureRoomReceipt]
    {
        guard fileManager.fileExists(atPath: ledgerURL.path) else {
            if let lastKnownGood = try? decodeLedger(
                at: lastKnownGoodLedgerURL
            ) {
                return lastKnownGood
            }
            return loadSidecars()
        }
        do {
            return try decodeLedger(at: ledgerURL)
        } catch {
            isWritable = false
            let timestamp = ISO8601DateFormatter()
                .string(from: Date())
                .replacingOccurrences(of: ":", with: "-")
            let quarantine = directoryURL.appendingPathComponent(
                "room-state-outbox-unreadable-\(timestamp)-\(UUID().uuidString.lowercased()).json"
            )
            do {
                try fileManager.copyItem(
                    at: ledgerURL,
                    to: quarantine
                )
                quarantinedLedgerURL = quarantine
            } catch {
                quarantinedLedgerURL = ledgerURL
            }
            persistenceError =
                "The canonical Nest room-receipt outbox is unreadable and locked read-only. Existing bytes were preserved."
            if let lastKnownGood = try? decodeLedger(
                at: lastKnownGoodLedgerURL
            ) {
                return lastKnownGood
            }
            return loadSidecars()
        }
    }

    private func decodeLedger(
        at url: URL
    ) throws -> [MacCaptureRoomReceipt] {
        let data = try Data(contentsOf: url)
        return try Self.decoder.decode(
            [MacCaptureRoomReceipt].self,
            from: data
        )
    }

    private func loadSidecars() -> [MacCaptureRoomReceipt] {
        let urls = (
            try? fileManager.contentsOfDirectory(
                at: directoryURL,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )
        ) ?? []
        var byID: [UUID: MacCaptureRoomReceipt] = [:]
        for url in urls where url.lastPathComponent.hasSuffix(
            ".quipsly-room-receipt.json"
        ) {
            guard let data = try? Data(contentsOf: url),
                  let receipt = try? Self.decoder.decode(
                    MacCaptureRoomReceipt.self,
                    from: data
                  ) else {
                continue
            }
            byID[receipt.id] = receipt
        }
        return Array(byID.values)
    }

    private func sidecarURL(_ receiptID: UUID) -> URL {
        directoryURL.appendingPathComponent(
            "room-state-\(receiptID.uuidString.lowercased()).quipsly-room-receipt.json"
        )
    }

    private func pruneSidecars(retaining IDs: Set<UUID>) {
        let urls = (
            try? fileManager.contentsOfDirectory(
                at: directoryURL,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )
        ) ?? []
        for url in urls where url.lastPathComponent.hasSuffix(
            ".quipsly-room-receipt.json"
        ) {
            guard let data = try? Data(contentsOf: url),
                  let receipt = try? Self.decoder.decode(
                    MacCaptureRoomReceipt.self,
                    from: data
                  ),
                  !IDs.contains(receipt.id) else {
                continue
            }
            try? fileManager.removeItem(at: url)
        }
    }

    private func requiredIdentity(_ value: String) throws -> String {
        guard let normalized = normalizedOwner(value) else {
            throw MacCaptureRoomReceiptOutboxError
                .ownerIdentityUnavailable
        }
        return normalized
    }

    private func requiredRoomIdentity(
        _ value: String
    ) throws -> String {
        guard let normalized = normalizedRoomIdentity(value) else {
            throw MacCaptureRoomReceiptOutboxError
                .invalidRoomIdentity
        }
        return normalized
    }

    private func normalizedOwner(_ value: String) -> String? {
        let clean = value.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !clean.isEmpty, clean.count <= 512 else {
            return nil
        }
        return clean.lowercased()
    }

    private func normalizedRoomIdentity(_ value: String) -> String? {
        let clean = value.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !clean.isEmpty, clean.count <= 512 else {
            return nil
        }
        return clean
    }

    private func sortReceipts() {
        receipts.sort {
            if $0.occurredAt != $1.occurredAt {
                return $0.occurredAt < $1.occurredAt
            }
            return $0.id.uuidString < $1.id.uuidString
        }
    }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }

    private static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
#endif
