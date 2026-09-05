import Foundation

@main
enum OnDeviceTranscriptLedgerPolicyHarness {
    static let recordingId = UUID(uuidString: "0f9177da-393f-4b46-8ba4-e5c30aa1d19d")!
    static let requestId = UUID(uuidString: "69872594-ec3f-4f08-b36b-377b6ea59be0")!
    static let digest = String(repeating: "a", count: 64)

    static func main() {
        expectSidecar(validSidecar(), true, "valid source-bound sidecar")
        expectSidecar(validSidecar(sourceSha256: "A" + String(repeating: "a", count: 63)), false, "noncanonical hash")
        expectSidecar(validSidecar(sourceByteCount: 0), false, "empty source")
        expectSidecar(validSidecar(ownerAccountId: "  "), false, "missing owner")
        expectSidecar(validSidecar(segments: []), false, "missing timed text")
        expectSidecar(validSidecar(segments: [segment(2, 3), segment(1, 2)]), false, "out-of-order timing")
        expectSidecar(validSidecar(segments: [segment(0, .infinity)]), false, "nonfinite timing")
        expectSidecar(validSidecar(segments: [segment(0, 1, text: "  ")]), false, "blank text")
        expectSidecar(validSidecar(recognitionExecution: "quipsly-cloud"), true, "canonical cloud handoff")
        expectSidecar(validSidecar(recognitionExecution: "untrusted-import"), false, "unknown transcript execution")

        expectReceipt(validReceipt(), true, "receipt bound to sidecar")
        expectReceipt(validReceipt(sidecarSha256: String(repeating: "b", count: 64)), false, "receipt for stale sidecar")
        expectReceipt(validReceipt(transcriptJobId: " "), false, "receipt without canonical job")
        expectReceipt(validReceipt(provider: ""), false, "receipt without provider")

        expectHandoff(validHandoff(), true, "exact cloud handoff")
        expectHandoff(validHandoff(roomId: "room-2"), false, "wrong handoff room")
        expectHandoff(validHandoff(transcriptJobId: "job-2"), false, "wrong handoff job")
        expectHandoff(validHandoff(recordingAssetId: "asset-2"), false, "wrong handoff source")
        expectHandoff(validHandoff(schema: "quipsly-canonical-transcript-handoff-v1"), false, "stale handoff schema")
        expectHandoff(validHandoff(segments: [segment(2, 3), segment(1, 2)]), false, "invalid handoff timing")

        print("PASS 10 sidecar, 4 receipt, and 6 cloud handoff transcript-ledger policy tests")
    }

    private static func validSidecar(
        sourceSha256: String = digest,
        sourceByteCount: Int64 = 4_096,
        ownerAccountId: String = "firebase:participant-1",
        recognitionExecution: String = "on-device",
        segments: [OnDeviceTranscriptLedgerSegmentEvidence] = [segment(0, 1)]
    ) -> OnDeviceTranscriptLedgerSidecarEvidence {
        OnDeviceTranscriptLedgerSidecarEvidence(
            schemaVersion: 1,
            localRecordingId: recordingId,
            ownerAccountId: ownerAccountId,
            sourceSha256: sourceSha256,
            sourceByteCount: sourceByteCount,
            language: "en-US",
            createdAt: Date(timeIntervalSince1970: 1_800_000_000),
            recognitionExecution: recognitionExecution,
            configurationHash: digest,
            segments: segments
        )
    }

    private static func validReceipt(
        sidecarSha256: String = digest,
        transcriptJobId: String = "transcript-job-1",
        provider: String = "apple-speech-transcriber-on-device"
    ) -> OnDeviceTranscriptLedgerReceiptEvidence {
        OnDeviceTranscriptLedgerReceiptEvidence(
            schemaVersion: 1,
            localRecordingId: recordingId,
            clientRequestId: requestId,
            sidecarSha256: sidecarSha256,
            transcriptJobId: transcriptJobId,
            provider: provider,
            submittedAt: Date(timeIntervalSince1970: 1_800_000_030)
        )
    }

    private static func validHandoff(
        schema: String = "quipsly-canonical-transcript-handoff-v2",
        roomId: String = "room-1",
        transcriptJobId: String = "job-1",
        recordingAssetId: String = "asset-1",
        segments: [OnDeviceTranscriptLedgerSegmentEvidence] = [segment(0, 1)]
    ) -> OnDeviceTranscriptCloudHandoffEvidence {
        OnDeviceTranscriptCloudHandoffEvidence(
            schema: schema,
            roomId: roomId,
            transcriptJobId: transcriptJobId,
            recordingAssetId: recordingAssetId,
            segments: segments
        )
    }

    private static func segment(
        _ start: Double,
        _ end: Double,
        text: String = "Durable words"
    ) -> OnDeviceTranscriptLedgerSegmentEvidence {
        OnDeviceTranscriptLedgerSegmentEvidence(
            startSeconds: start,
            endSeconds: end,
            text: text
        )
    }

    private static func expectSidecar(
        _ sidecar: OnDeviceTranscriptLedgerSidecarEvidence,
        _ expected: Bool,
        _ label: String
    ) {
        guard OnDeviceTranscriptLedgerPolicy.acceptsSidecar(
            sidecar,
            expectedRecordingId: recordingId
        ) == expected else {
            fail(label)
        }
    }

    private static func expectReceipt(
        _ receipt: OnDeviceTranscriptLedgerReceiptEvidence,
        _ expected: Bool,
        _ label: String
    ) {
        guard OnDeviceTranscriptLedgerPolicy.acceptsReceipt(
            receipt,
            expectedRecordingId: recordingId,
            expectedClientRequestId: requestId,
            expectedSidecarSha256: digest
        ) == expected else {
            fail(label)
        }
    }

    private static func expectHandoff(
        _ handoff: OnDeviceTranscriptCloudHandoffEvidence,
        _ expected: Bool,
        _ label: String
    ) {
        guard OnDeviceTranscriptLedgerPolicy.acceptsCloudHandoff(
            handoff,
            expectedRoomId: "room-1",
            expectedTranscriptJobId: "job-1",
            expectedRecordingAssetId: "asset-1"
        ) == expected else {
            fail(label)
        }
    }

    private static func fail(_ label: String) -> Never {
        FileHandle.standardError.write(Data("FAIL: \(label)\n".utf8))
        Foundation.exit(1)
    }
}
