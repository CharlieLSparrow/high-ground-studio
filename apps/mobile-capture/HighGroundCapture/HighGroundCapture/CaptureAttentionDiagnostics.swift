import Foundation

struct CaptureAttentionDiagnosticEvent: Codable, Identifiable, Equatable {
    let id: UUID
    let occurredAt: Date
    let message: String
    let selectedSessionID: String?
    let selectedSessionIsLocal: Bool
    let canonicalSessionCount: Int
    let localDraftSessionCount: Int
    let isRefreshing: Bool
    let isCreatingSession: Bool
    let isChangingCapture: Bool
    let isChangingRoom: Bool
}

/// A small, device-local support ledger for the alert that people actually
/// see. It contains no transcript or media content and is excluded from backup.
/// Pulling this file from a development device makes the exact failure and
/// navigation state inspectable even when Xcode was not attached beforehand.
@MainActor
final class CaptureAttentionDiagnostics {
    static let shared = CaptureAttentionDiagnostics()

    private struct Ledger: Codable {
        let schemaVersion: Int
        var events: [CaptureAttentionDiagnosticEvent]
    }

    private static let maximumEventCount = 200
    private let fileURL: URL?
    private var events: [CaptureAttentionDiagnosticEvent]

    private init(fileManager: FileManager = .default) {
        let directory = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first?
            .appendingPathComponent("QuipslyCapture/Diagnostics", isDirectory: true)
        fileURL = directory?.appendingPathComponent("capture-attention-v1.json")

        if let directory {
            try? fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [
                    .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
                ]
            )
        }

        if let fileURL,
           let data = try? Data(contentsOf: fileURL),
           let ledger = try? JSONDecoder.captureDiagnostics.decode(
               Ledger.self,
               from: data
           ),
           ledger.schemaVersion == 1 {
            events = Array(ledger.events.suffix(Self.maximumEventCount))
        } else {
            events = []
        }
    }

    func record(
        message: String,
        selectedSessionID: String?,
        selectedSessionIsLocal: Bool,
        canonicalSessionCount: Int,
        localDraftSessionCount: Int,
        isRefreshing: Bool,
        isCreatingSession: Bool,
        isChangingCapture: Bool,
        isChangingRoom: Bool
    ) {
        events.append(
            CaptureAttentionDiagnosticEvent(
                id: UUID(),
                occurredAt: Date(),
                message: String(message.prefix(2_000)),
                selectedSessionID: selectedSessionID.map { String($0.prefix(256)) },
                selectedSessionIsLocal: selectedSessionIsLocal,
                canonicalSessionCount: canonicalSessionCount,
                localDraftSessionCount: localDraftSessionCount,
                isRefreshing: isRefreshing,
                isCreatingSession: isCreatingSession,
                isChangingCapture: isChangingCapture,
                isChangingRoom: isChangingRoom
            )
        )
        events = Array(events.suffix(Self.maximumEventCount))
        persist()
    }

    private func persist() {
        guard let fileURL,
              let data = try? JSONEncoder.captureDiagnostics.encode(
                  Ledger(schemaVersion: 1, events: events)
              ) else { return }
        do {
            try data.write(
                to: fileURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutableURL = fileURL
            try mutableURL.setResourceValues(values)
        } catch {
            // Diagnostics must never sit between a person and Record.
        }
    }
}

private extension JSONEncoder {
    static var captureDiagnostics: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

private extension JSONDecoder {
    static var captureDiagnostics: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
