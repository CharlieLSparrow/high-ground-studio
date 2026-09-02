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

struct CaptureAttentionSupportSummary: Equatable {
    let eventCount: Int
    let latestOccurredAt: Date?
    let latestCategory: String?
    let latestTransitionState: String?
    let latestSelectedSessionWasLocal: Bool?
    let latestCanonicalSessionCount: Int?
    let latestLocalDraftSessionCount: Int?
}

struct CaptureAttentionPresentation: Equatable {
    let title: String
    let offersSettingsRecovery: Bool
    let actionTitle: String
    let recovery: CaptureAttentionRecovery
}

enum CaptureAttentionRecovery: Equatable {
    case openSettings
    case retryMicrophone
    case refresh
    case openSessions
    case openLibrary
    case openAccount
    case dismiss
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

    /// Coarse, privacy-safe state for the user-controlled support snapshot.
    /// Session identifiers and exact alert text remain only in the protected
    /// development ledger; this summary can be shared without exposing work.
    var supportSummary: CaptureAttentionSupportSummary {
        guard let latest = events.last else {
            return CaptureAttentionSupportSummary(
                eventCount: 0,
                latestOccurredAt: nil,
                latestCategory: nil,
                latestTransitionState: nil,
                latestSelectedSessionWasLocal: nil,
                latestCanonicalSessionCount: nil,
                latestLocalDraftSessionCount: nil
            )
        }

        let activeTransitions = [
            latest.isRefreshing ? "refreshing" : nil,
            latest.isCreatingSession ? "creating-session" : nil,
            latest.isChangingCapture ? "changing-capture" : nil,
            latest.isChangingRoom ? "changing-room" : nil,
        ].compactMap { $0 }

        return CaptureAttentionSupportSummary(
            eventCount: events.count,
            latestOccurredAt: latest.occurredAt,
            latestCategory: Self.supportCategory(for: latest.message),
            latestTransitionState: activeTransitions.isEmpty
                ? "idle"
                : activeTransitions.joined(separator: ","),
            latestSelectedSessionWasLocal: latest.selectedSessionIsLocal,
            latestCanonicalSessionCount: max(0, latest.canonicalSessionCount),
            latestLocalDraftSessionCount: max(0, latest.localDraftSessionCount)
        )
    }

    nonisolated static func presentation(for message: String?) -> CaptureAttentionPresentation {
        let normalized = message?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? ""
        let settingsCanHelp = (
            normalized.contains("permission")
                || normalized.contains("allow ")
                || normalized.contains("enable ")
        ) && (
            normalized.contains("microphone")
                || normalized.contains("camera")
                || normalized.contains("speech recognition")
        )

        if settingsCanHelp, normalized.contains("microphone") {
            return CaptureAttentionPresentation(
                title: "Microphone access is off",
                offersSettingsRecovery: true,
                actionTitle: "Open Settings",
                recovery: .openSettings
            )
        }
        if settingsCanHelp, normalized.contains("camera") {
            return CaptureAttentionPresentation(
                title: "Camera access is off",
                offersSettingsRecovery: true,
                actionTitle: "Open Settings",
                recovery: .openSettings
            )
        }
        if settingsCanHelp {
            return CaptureAttentionPresentation(
                title: "Permission needed",
                offersSettingsRecovery: true,
                actionTitle: "Open Settings",
                recovery: .openSettings
            )
        }

        let category = supportCategory(for: normalized)
        let title = switch category {
        case "microphone-or-audio-route": "Check your microphone"
        case "camera": "Check your camera"
        case "device-storage": "More storage is needed"
        case "upload-or-verification": "Upload needs attention"
        case "call": "Call couldn't connect"
        case "connection": "Connection interrupted"
        case "account": "Check your account"
        case "session-or-workspace": "Check this Session"
        case "recording": "Recording couldn't finish"
        default: "Quipsly couldn't finish that"
        }
        let action = switch category {
        case "connection": ("Try again", CaptureAttentionRecovery.refresh)
        case "account": ("Open Account", CaptureAttentionRecovery.openAccount)
        case "device-storage", "upload-or-verification", "recording":
            ("Open Library", CaptureAttentionRecovery.openLibrary)
        case "microphone-or-audio-route":
            ("Try again", CaptureAttentionRecovery.retryMicrophone)
        case "camera", "call", "session-or-workspace":
            ("Open Sessions", CaptureAttentionRecovery.openSessions)
        default: ("Dismiss", CaptureAttentionRecovery.dismiss)
        }
        return CaptureAttentionPresentation(
            title: title,
            offersSettingsRecovery: false,
            actionTitle: action.0,
            recovery: action.1
        )
    }

    nonisolated private static func supportCategory(for message: String) -> String {
        let normalized = message.lowercased()
        if normalized.contains("microphone") || normalized.contains("audio route") {
            return "microphone-or-audio-route"
        }
        if normalized.contains("camera") {
            return "camera"
        }
        if normalized.contains("permission") || normalized.contains("allow ") {
            return "system-permission"
        }
        if normalized.contains("storage")
            || normalized.contains("disk")
            || normalized.contains("free space") {
            return "device-storage"
        }
        if normalized.contains("upload") {
            return "upload-or-verification"
        }
        if normalized.contains("live room")
            || normalized.contains("call")
            || normalized.contains("join the room") {
            return "call"
        }
        if normalized.contains("network") || normalized.contains("offline") || normalized.contains("reach nest") {
            return "connection"
        }
        if normalized.contains("account") || normalized.contains("sign in") {
            return "account"
        }
        if normalized.contains("session")
            || normalized.contains("nest")
            || normalized.contains("workspace")
            || normalized.contains("that space")
            || normalized.contains("selected space") {
            return "session-or-workspace"
        }
        if normalized.contains("record") || normalized.contains("capture") {
            return "recording"
        }
        return "capture-attention"
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
