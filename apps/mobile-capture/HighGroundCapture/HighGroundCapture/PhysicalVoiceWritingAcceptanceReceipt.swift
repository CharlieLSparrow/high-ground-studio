#if DEBUG && !targetEnvironment(simulator)
import Foundation

/// A protected, pullable receipt for directly attached device acceptance.
///
/// Console output is useful while Xcode remains attached, but it is not a
/// durable boundary: a cable, tunnel, or process can disappear after the
/// source is already safe. This receipt deliberately lives inside the app data
/// container so `devicectl device copy from --domain-type appDataContainer`
/// can read the last confirmed phase without exposing it in the shipping app.
struct PhysicalVoiceWritingAcceptanceReceipt: Codable {
    enum Phase: String, Codable {
        case requested
        case startFailed = "start-failed"
        case recording
        case cancelled
        case finished
    }

    static let schema = "quipsly-physical-voice-writing-acceptance-v1"

    let schema: String
    let attemptID: UUID
    let recordedAt: Date
    let phase: Phase
    let sessionID: String
    let appBuild: String
    let recordingID: UUID?
    let captureState: String
    let durationSeconds: Double?
    let localStatus: String?
    let sourceFileName: String?
    let sourceByteCount: Int64?
    let saved: Bool
    let detail: String?
}

enum PhysicalVoiceWritingAcceptanceReceiptStore {
    private static let directoryName = "PhysicalVoiceWritingAcceptance"
    private static let fileName = "latest.json"

    static func write(
        attemptID: UUID,
        phase: PhysicalVoiceWritingAcceptanceReceipt.Phase,
        sessionID: String,
        recordingID: UUID? = nil,
        captureState: String,
        durationSeconds: Double? = nil,
        localStatus: String? = nil,
        sourceFileName: String? = nil,
        sourceByteCount: Int64? = nil,
        saved: Bool = false,
        detail: String? = nil,
        fileManager: FileManager = .default
    ) {
        do {
            let receipt = PhysicalVoiceWritingAcceptanceReceipt(
                schema: PhysicalVoiceWritingAcceptanceReceipt.schema,
                attemptID: attemptID,
                recordedAt: Date(),
                phase: phase,
                sessionID: sessionID,
                appBuild: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
                recordingID: recordingID,
                captureState: captureState,
                durationSeconds: durationSeconds,
                localStatus: localStatus,
                sourceFileName: cleaned(sourceFileName),
                sourceByteCount: sourceByteCount,
                saved: saved,
                detail: cleaned(detail)
            )
            let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? URL(fileURLWithPath: NSHomeDirectory())
                    .appendingPathComponent("Library/Application Support", isDirectory: true)
            let directory = support
                .appendingPathComponent("QuipslyCapture", isDirectory: true)
                .appendingPathComponent(directoryName, isDirectory: true)
            try fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
            )
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(receipt)
            let destination = directory.appendingPathComponent(fileName, isDirectory: false)
            try data.write(to: destination, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            try fileManager.setAttributes(
                [
                    .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
                    .posixPermissions: 0o600,
                ],
                ofItemAtPath: destination.path
            )
            var excluded = URLResourceValues()
            excluded.isExcludedFromBackup = true
            var mutableDirectory = directory
            try mutableDirectory.setResourceValues(excluded)
        } catch {
            print("QUIPSLY_PHYSICAL_VOICE_WRITING_ACCEPTANCE receipt_failed phase=\(phase.rawValue) detail=\(error.localizedDescription)")
        }
    }

    private static func cleaned(_ value: String?) -> String? {
        let value = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.isEmpty == false ? value : nil
    }
}
#endif
