import Foundation

struct OnDeviceTranscriptLedgerSegmentEvidence: Sendable {
    let startSeconds: Double
    let endSeconds: Double
    let text: String
}

struct OnDeviceTranscriptLedgerSidecarEvidence: Sendable {
    let schemaVersion: Int
    let localRecordingId: UUID
    let ownerAccountId: String
    let sourceSha256: String
    let sourceByteCount: Int64
    let language: String
    let createdAt: Date
    let recognitionExecution: String
    let configurationHash: String
    let segments: [OnDeviceTranscriptLedgerSegmentEvidence]
}

struct OnDeviceTranscriptLedgerReceiptEvidence: Sendable {
    let schemaVersion: Int
    let localRecordingId: UUID
    let clientRequestId: UUID
    let sidecarSha256: String
    let transcriptJobId: String
    let provider: String
    let submittedAt: Date
}

struct OnDeviceTranscriptCloudHandoffEvidence: Sendable {
    let schema: String
    let roomId: String
    let transcriptJobId: String
    let recordingAssetId: String
    let segments: [OnDeviceTranscriptLedgerSegmentEvidence]
}

/// Validates the protected transcript ledger before any local artifact can be
/// treated as saved or attached. Nest repeats these checks at its trust
/// boundary; this local policy prevents a damaged sidecar or stale receipt from
/// suppressing recovery work while the device is offline.
enum OnDeviceTranscriptLedgerPolicy {
    private static let maximumSegments = 12_000
    private static let maximumSegmentCharacters = 12_000
    private static let maximumTranscriptCharacters = 1_000_000
    private static let acceptedRecognitionExecutions = [
        "on-device",
        "apple-speech-service",
        "quipsly-cloud",
    ]

    static func acceptsSidecar(
        _ sidecar: OnDeviceTranscriptLedgerSidecarEvidence,
        expectedRecordingId: UUID
    ) -> Bool {
        guard sidecar.schemaVersion == 1,
              sidecar.localRecordingId == expectedRecordingId,
              !sidecar.ownerAccountId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              isSha256(sidecar.sourceSha256),
              sidecar.sourceByteCount > 0,
              !sidecar.language.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              sidecar.language.count <= 64,
              sidecar.createdAt.timeIntervalSinceReferenceDate.isFinite,
              acceptedRecognitionExecutions.contains(sidecar.recognitionExecution),
              isSha256(sidecar.configurationHash),
              !sidecar.segments.isEmpty,
              sidecar.segments.count <= maximumSegments else {
            return false
        }

        return acceptsSegments(sidecar.segments)
    }

    static func acceptsCloudHandoff(
        _ handoff: OnDeviceTranscriptCloudHandoffEvidence,
        expectedRoomId: String,
        expectedTranscriptJobId: String,
        expectedRecordingAssetId: String
    ) -> Bool {
        handoff.schema == "quipsly-canonical-transcript-handoff-v2"
            && handoff.roomId == expectedRoomId
            && handoff.transcriptJobId == expectedTranscriptJobId
            && handoff.recordingAssetId == expectedRecordingAssetId
            && handoff.segments.count <= maximumSegments
            && acceptsSegments(handoff.segments)
    }

    private static func acceptsSegments(
        _ segments: [OnDeviceTranscriptLedgerSegmentEvidence]
    ) -> Bool {
        guard !segments.isEmpty else { return false }
        var previousStart = -1.0
        var totalCharacters = 0
        for segment in segments {
            let text = segment.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard segment.startSeconds.isFinite,
                  segment.endSeconds.isFinite,
                  segment.startSeconds >= 0,
                  segment.endSeconds > segment.startSeconds,
                  segment.startSeconds >= previousStart,
                  !text.isEmpty,
                  text.count <= maximumSegmentCharacters else {
                return false
            }
            totalCharacters += text.count
            guard totalCharacters <= maximumTranscriptCharacters else { return false }
            previousStart = segment.startSeconds
        }
        return true
    }

    static func acceptsReceipt(
        _ receipt: OnDeviceTranscriptLedgerReceiptEvidence,
        expectedRecordingId: UUID,
        expectedClientRequestId: UUID,
        expectedSidecarSha256: String
    ) -> Bool {
        receipt.schemaVersion == 1
            && receipt.localRecordingId == expectedRecordingId
            && receipt.clientRequestId == expectedClientRequestId
            && isSha256(receipt.sidecarSha256)
            && receipt.sidecarSha256 == expectedSidecarSha256
            && !receipt.transcriptJobId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !receipt.provider.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && receipt.submittedAt.timeIntervalSinceReferenceDate.isFinite
    }

    private static func isSha256(_ value: String) -> Bool {
        value.count == 64 && value.utf8.allSatisfy { byte in
            (48...57).contains(byte) || (97...102).contains(byte)
        }
    }
}
