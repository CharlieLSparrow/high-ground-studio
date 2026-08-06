import Combine
import CryptoKit
import Foundation
import UIKit

struct CaptureEndpointQueuePayload: Codable, Equatable {
    let requestId: UUID
    let clientInstanceId: String
    let clientKind: String
    let deviceLabel: String
    let queueRevision: String
    let queueState: String
    let localSourceCount: Int
    let pendingSourceCount: Int
    let failedSourceCount: Int
    let observedCaptureIds: [String]
    let recordingAssetIds: [String]
    let latestLocalMutationAt: Date
    let reconciledAt: Date
}

enum CaptureEndpointQueueDelivery {
    case acknowledged
    case retry(String)
    case held(String)
}

/// Protected, installation-scoped outbox for the latest durable iPhone source
/// queue. RecordingAsset proves server bytes; this journal separately proves
/// what this exact app installation most recently knew about local recovery.
@MainActor
final class CaptureEndpointQueueOutbox: ObservableObject {
    static let shared = CaptureEndpointQueueOutbox()

    @Published private(set) var pendingCount = 0
    @Published private(set) var statusLine: String?

    private struct Cursor: Codable {
        var ownerAccountID: String
        var roomID: String
        var captureGroupID: UUID
        var fingerprint: String
        var revision: UInt64
        var pendingPayload: CaptureEndpointQueuePayload?
        var lastAcknowledgedAt: Date?
    }

    private struct Ledger: Codable {
        let schemaVersion: Int
        var cursors: [String: Cursor]
    }

    private var ledger: Ledger
    private let ledgerURL: URL
    private var retryTask: Task<Void, Never>?
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private init(fileManager: FileManager = .default) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        self.encoder = encoder
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("QuipslyCapture/EndpointQueueOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support/QuipslyCapture/EndpointQueueOutbox", isDirectory: true)
        try? fileManager.createDirectory(at: support, withIntermediateDirectories: true)
        try? fileManager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: support.path)
        ledgerURL = support.appendingPathComponent("endpoint-queue-v1.json")
        ledger = (try? Data(contentsOf: ledgerURL)).flatMap { try? decoder.decode(Ledger.self, from: $0) }
            ?? Ledger(schemaVersion: 1, cursors: [:])
        publishCounts()
    }

    func reconcile(recordings: [LocalRecording], client: CaptureSessionClient) {
        guard let owner = AuthManager.currentStoredOwnerID()?.trimmingCharacters(in: .whitespacesAndNewlines), !owner.isEmpty else { return }
        let owned = recordings.filter { $0.ownerAccountID?.trimmingCharacters(in: .whitespacesAndNewlines) == owner }
        let groups = Dictionary(grouping: owned.compactMap { recording -> (String, UUID, LocalRecording)? in
            guard let roomID = recording.callRoomId?.trimmingCharacters(in: .whitespacesAndNewlines), !roomID.isEmpty,
                  let captureGroupID = recording.captureGroupId else { return nil }
            return (roomID, captureGroupID, recording)
        }, by: { "\($0.0)\u{0}\($0.1.uuidString.lowercased())" })

        for (key, rows) in groups {
            let recordings = rows.map(\.2).sorted { $0.id.uuidString < $1.id.uuidString }
            guard let first = rows.first else { continue }
            let failedStatuses: Set<LocalRecording.Status> = [.uploadHeld, .needsRepair, .captureFailed, .missingFile]
            let failed = recordings.filter { failedStatuses.contains($0.status) }.count
            let completed = recordings.filter {
                let hasServerAsset = $0.recordingAssetId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                if $0.status == .uploaded { return hasServerAsset }
                return $0.status == .deletedLocally
                    && $0.localDeletionCloudVerificationStatus?.lowercased() == "verified"
                    && hasServerAsset
            }
            let pending = recordings.count - failed - completed.count
            let fingerprintSource = recordings.map {
                "\($0.id.uuidString.lowercased()):\($0.status.rawValue):\($0.recordingAssetId ?? "-"):\($0.localDeletionCloudVerificationStatus ?? "-"):\($0.serverProcessingDisposition ?? "-")"
            }.joined(separator: "|")
            let fingerprint = SHA256.hash(data: Data(fingerprintSource.utf8)).map { String(format: "%02x", $0) }.joined()
            let current = ledger.cursors[key]
            if current?.fingerprint == fingerprint { continue }
            let nextRevision = (current?.revision ?? 0) + 1
            let latestMutation = recordings.compactMap { $0.stoppedAt ?? $0.startedAt }.max() ?? Date()
            let payload = CaptureEndpointQueuePayload(
                requestId: UUID(),
                clientInstanceId: CaptureClientInstallation.id,
                clientKind: "ios",
                deviceLabel: "Quipsly Capture · \(UIDevice.current.name)",
                queueRevision: String(nextRevision),
                queueState: pending + failed == 0 ? "DRAINED" : "NOT_EMPTY",
                localSourceCount: recordings.count,
                pendingSourceCount: pending,
                failedSourceCount: failed,
                observedCaptureIds: recordings.map { $0.id.uuidString.lowercased() },
                recordingAssetIds: completed.compactMap { $0.recordingAssetId }.sorted(),
                latestLocalMutationAt: latestMutation,
                reconciledAt: Date()
            )
            ledger.cursors[key] = Cursor(
                ownerAccountID: owner,
                roomID: first.0,
                captureGroupID: first.1,
                fingerprint: fingerprint,
                revision: nextRevision,
                pendingPayload: payload,
                lastAcknowledgedAt: current?.lastAcknowledgedAt
            )
        }
        guard persist() else { return }
        flush(client: client)
    }

    func flush(client: CaptureSessionClient) {
        retryTask?.cancel()
        retryTask = Task { @MainActor [weak self] in
            guard let self else { return }
            for key in self.ledger.cursors.keys.sorted() {
                guard !Task.isCancelled,
                      var cursor = self.ledger.cursors[key],
                      let payload = cursor.pendingPayload,
                      cursor.ownerAccountID == AuthManager.currentStoredOwnerID() else { continue }
                let result = await client.sendEndpointQueueReceipt(payload, roomID: cursor.roomID, expectedOwnerAccountID: cursor.ownerAccountID)
                switch result {
                case .acknowledged:
                    cursor.pendingPayload = nil
                    cursor.lastAcknowledgedAt = Date()
                    self.ledger.cursors[key] = cursor
                    _ = self.persist()
                    self.statusLine = payload.queueState == "DRAINED"
                        ? "Nest confirms this iPhone’s latest local source queue is drained."
                        : "Nest confirms this iPhone still has local recovery work."
                case .held(let message):
                    self.statusLine = "Endpoint queue held: \(message) Local recordings remain preserved."
                case .retry(let message):
                    self.statusLine = "Endpoint queue waiting: \(message) Local recordings remain preserved."
                    self.scheduleRetry(client: client)
                    return
                }
            }
        }
    }

    private func scheduleRetry(client: CaptureSessionClient) {
        retryTask?.cancel()
        retryTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled else { return }
            self?.flush(client: client)
        }
    }

    @discardableResult
    private func persist() -> Bool {
        do {
            let data = try encoder.encode(ledger)
            try data.write(to: ledgerURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            publishCounts()
            return true
        } catch {
            statusLine = "The protected endpoint queue journal could not be saved. Quipsly will not claim this iPhone is safe to leave."
            return false
        }
    }

    private func publishCounts() {
        pendingCount = ledger.cursors.values.filter { $0.pendingPayload != nil }.count
    }
}
