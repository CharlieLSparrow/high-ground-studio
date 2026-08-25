import Combine
import Foundation

struct CaptureRecordingReceiptPayload: Codable, Equatable {
    let receiptId: UUID
    let directiveId: String
    let state: CaptureRecordingEndpointState
    let captureId: UUID?
    let clientInstanceId: String
    let clientKind: String
    let deviceLabel: String
    let detail: String?
    /// Optional for backward-compatible decoding of receipts queued before
    /// device event time became part of the immutable server contract.
    let occurredAt: String?
}

struct PendingCaptureRecordingReceipt: Codable, Equatable, Identifiable {
    enum DeliveryState: String, Codable {
        case pending
        case acknowledged
        case rejected
    }

    let id: UUID
    let ownerAccountID: String
    let roomID: String
    let payload: CaptureRecordingReceiptPayload
    let createdAt: Date
    var deliveryState: DeliveryState
    var deliveredAt: Date?
    var serverError: String?
}

/// Protected, account-partitioned delivery evidence for coordinated recording
/// state. These receipts describe an endpoint's observation of local capture;
/// they never create, replace, verify, or delete media.
@MainActor
final class CaptureRecordingReceiptOutbox: ObservableObject {
    static let shared = CaptureRecordingReceiptOutbox()

    @Published private(set) var receipts: [PendingCaptureRecordingReceipt] = []
    @Published private(set) var persistenceError: String?

    private let ledgerURL: URL
    private var storedReceipts: [PendingCaptureRecordingReceipt] = []
    private var activeOwnerAccountID: String?
    private var ledgerIsWritable = true
    private var accountObserver: NSObjectProtocol?

    init(fileManager: FileManager = .default) {
        activeOwnerAccountID = Self.normalized(AuthManager.currentStoredOwnerID())
        let applicationSupport = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Library/Application Support", isDirectory: true)
        let directory = applicationSupport
            .appendingPathComponent("QuipslyCapture/RecordingCoordination", isDirectory: true)
        ledgerURL = directory
            .appendingPathComponent("endpoint-receipt-outbox-v1.json", isDirectory: false)

        do {
            try fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [
                    .protectionKey:
                        FileProtectionType.completeUntilFirstUserAuthentication,
                ]
            )
            if fileManager.fileExists(atPath: ledgerURL.path) {
                let data = try Data(contentsOf: ledgerURL)
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                storedReceipts = try decoder.decode(
                    [PendingCaptureRecordingReceipt].self,
                    from: data
                )
            }
            pruneAndPublish()
        } catch {
            ledgerIsWritable = false
            persistenceError = "The protected recording-status journal is unreadable and will not be overwritten: \(error.localizedDescription)"
            receipts = []
        }

        accountObserver = NotificationCenter.default.addObserver(
            forName: .quipslyCaptureAccountIdentityDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            MainActor.assumeIsolated { [weak self] in
                self?.activeOwnerAccountID = Self.normalized(
                    notification.object as? String
                )
                self?.pruneAndPublish()
            }
        }
    }

    deinit {
        if let accountObserver {
            NotificationCenter.default.removeObserver(accountObserver)
        }
    }

    var pendingReceipts: [PendingCaptureRecordingReceipt] {
        guard ledgerIsWritable else { return [] }
        return receipts
            .filter { $0.deliveryState == .pending }
            .sorted { $0.createdAt < $1.createdAt }
    }

    var pendingCount: Int {
        pendingReceipts.count
    }

    func latest(roomID: String) -> PendingCaptureRecordingReceipt? {
        receipts
            .filter { $0.roomID == roomID }
            .sorted { $0.createdAt > $1.createdAt }
            .first
    }

    @discardableResult
    func enqueue(
        roomID: String,
        ownerAccountID: String,
        payload: CaptureRecordingReceiptPayload,
        createdAt: Date = Date()
    ) throws -> PendingCaptureRecordingReceipt {
        guard ledgerIsWritable else { throw StoreError.readOnly }
        guard let normalizedOwner = Self.normalized(ownerAccountID),
              normalizedOwner == activeOwnerAccountID else {
            throw StoreError.ownerMismatch
        }
        if let existing = storedReceipts.first(where: { $0.id == payload.receiptId }) {
            guard existing.ownerAccountID == normalizedOwner,
                  existing.roomID == roomID,
                  existing.payload == payload else {
                throw StoreError.requestIdentityConflict
            }
            return existing
        }
        let receipt = PendingCaptureRecordingReceipt(
            id: payload.receiptId,
            ownerAccountID: normalizedOwner,
            roomID: roomID,
            payload: payload,
            createdAt: createdAt,
            deliveryState: .pending,
            deliveredAt: nil,
            serverError: nil
        )
        var updated = storedReceipts
        updated.append(receipt)
        try persist(updated)
        storedReceipts = updated
        pruneAndPublish()
        return receipt
    }

    func markAcknowledged(_ id: UUID, at date: Date = Date()) {
        update(id) { receipt in
            receipt.deliveryState = .acknowledged
            receipt.deliveredAt = date
            receipt.serverError = nil
        }
    }

    func markRejected(_ id: UUID, message: String, at date: Date = Date()) {
        update(id) { receipt in
            receipt.deliveryState = .rejected
            receipt.deliveredAt = date
            receipt.serverError = message
        }
    }

    private func update(
        _ id: UUID,
        mutation: (inout PendingCaptureRecordingReceipt) -> Void
    ) {
        guard ledgerIsWritable,
              let index = storedReceipts.firstIndex(where: { $0.id == id }) else {
            return
        }
        var updated = storedReceipts
        mutation(&updated[index])
        do {
            try persist(updated)
            storedReceipts = updated
            pruneAndPublish()
        } catch {
            persistenceError = "The recording-status result could not be preserved: \(error.localizedDescription)"
        }
    }

    private func pruneAndPublish() {
        let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
        let pruned = storedReceipts.filter {
            $0.deliveryState == .pending || $0.createdAt >= cutoff
        }
        if ledgerIsWritable, pruned != storedReceipts {
            do {
                try persist(pruned)
                storedReceipts = pruned
            } catch {
                persistenceError = "Old recording-status receipts could not be pruned: \(error.localizedDescription)"
            }
        }
        guard let activeOwnerAccountID else {
            receipts = []
            return
        }
        receipts = storedReceipts.filter {
            $0.ownerAccountID == activeOwnerAccountID
        }
    }

    private func persist(_ value: [PendingCaptureRecordingReceipt]) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(value)
        try data.write(
            to: ledgerURL,
            options: [
                .atomic,
                .completeFileProtectionUntilFirstUserAuthentication,
            ]
        )
    }

    private static func normalized(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }

    enum StoreError: LocalizedError {
        case readOnly
        case ownerMismatch
        case requestIdentityConflict

        var errorDescription: String? {
            switch self {
            case .readOnly:
                "The protected recording-status journal is read-only. Existing bytes were preserved."
            case .ownerMismatch:
                "The recording status does not belong to the currently verified Quipsly account."
            case .requestIdentityConflict:
                "That recording-status receipt identity already belongs to different endpoint evidence."
            }
        }
    }
}
