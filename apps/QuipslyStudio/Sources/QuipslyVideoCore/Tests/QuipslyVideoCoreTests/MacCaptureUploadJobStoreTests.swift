import Foundation
import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
@MainActor
final class MacCaptureUploadJobStoreTests: XCTestCase {
    func testFinalizedRoomAudioCreatesDurableSharedCaptureJob()
        throws
    {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = try finalizedReceipt(in: root)
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )

        let job = try store.enqueueFinalizedAudio(
            receipt: receipt,
            ownerAccountID: "Charlie@Example.com"
        )

        XCTAssertEqual(job.id, receipt.recordingID)
        XCTAssertEqual(job.captureID, receipt.captureGroupID)
        XCTAssertEqual(
            job.captureGroupID,
            receipt.captureGroupID
        )
        XCTAssertEqual(job.phase, .prepared)
        XCTAssertEqual(job.contentType, "audio/wav")
        XCTAssertEqual(job.recordingConsentID, "consent-5")
        XCTAssertEqual(job.callRoomID, "room-5")
        XCTAssertTrue(
            job.sourceProfileJSON.contains("shure-mv7i-uid")
        )
        let evidence =
            try MacCaptureUploadJobStore.exactSourceEvidence(
                for: job
            )
        XCTAssertEqual(
            evidence.sizeBytes,
            job.expectedSizeBytes
        )
        XCTAssertEqual(evidence.sha256, job.expectedSHA256)
        let reopened = MacCaptureUploadJobStore(
            rootDirectory: root
        )
        let reopenedJob = try XCTUnwrap(
            reopened.job(
                id: job.id,
                ownerAccountID: "charlie@example.com"
            )
        )
        XCTAssertEqual(
            reopenedJob.expectedSHA256,
            job.expectedSHA256
        )
        XCTAssertEqual(reopenedJob.captureID, job.captureID)
        XCTAssertEqual(reopenedJob.filePath, job.filePath)
        XCTAssertEqual(reopenedJob.phase, .prepared)
    }

    func testUploadJobImmutableBindingCannotDrift() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = try finalizedReceipt(in: root)
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )
        let job = try store.enqueueFinalizedAudio(
            receipt: receipt,
            ownerAccountID: "charlie@example.com"
        )
        var progress = job
        progress.phase = .creating
        progress.attemptCount = 1
        progress.updatedAt = Date()
        try store.save(progress)
        XCTAssertEqual(
            store.job(
                id: job.id,
                ownerAccountID: job.ownerAccountID
            )?.phase,
            .creating
        )

        let changed = MacCaptureUploadJob(
            id: progress.id,
            ownerAccountID: progress.ownerAccountID,
            captureID: progress.captureID,
            captureGroupID: progress.captureGroupID,
            filePath: "/tmp/other.wav",
            sourceReceiptPath: progress.sourceReceiptPath,
            fileName: progress.fileName,
            contentType: progress.contentType,
            sourceType: progress.sourceType,
            expectedSizeBytes: progress.expectedSizeBytes,
            expectedSHA256: progress.expectedSHA256,
            projectSlug: progress.projectSlug,
            episodeSlug: progress.episodeSlug,
            trackID: progress.trackID,
            callRoomID: progress.callRoomID,
            participantID: progress.participantID,
            recordingConsentID: progress.recordingConsentID,
            capturePurpose: progress.capturePurpose,
            sourceProfileJSON: progress.sourceProfileJSON,
            startedAt: progress.startedAt,
            stoppedAt: progress.stoppedAt,
            createdAt: progress.createdAt
        )
        XCTAssertThrowsError(try store.save(changed))
    }

    func testLocalOnlyReceiptCannotEnterRoomUploadOutbox()
        throws
    {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        var receipt = try finalizedReceipt(in: root)
        receipt = ProductionAudioRecordingReceipt(
            recordingID: receipt.recordingID,
            configuration: ProductionAudioRecordingConfiguration(
                recordingID: receipt.recordingID,
                captureGroupID: receipt.captureGroupID,
                episodeSpaceID: receipt.episodeSpaceID,
                participantID: receipt.participantID,
                inputDevice: receipt.inputDevice,
                rootDirectory: root
            ),
            state: .finalized,
            channelCount: receipt.channelCount,
            startedAt: receipt.startedAt,
            stoppedAt: receipt.stoppedAt,
            startedMonotonicNanoseconds:
                receipt.startedMonotonicNanoseconds,
            stoppedMonotonicNanoseconds:
                receipt.stoppedMonotonicNanoseconds,
            frameCount: receipt.frameCount,
            recordingDirectoryPath:
                receipt.recordingDirectoryPath,
            audioPath: receipt.audioPath,
            partialAudioPath: nil,
            byteCount: receipt.byteCount,
            sha256: receipt.sha256,
            failure: nil
        )
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )

        XCTAssertThrowsError(
            try store.enqueueFinalizedAudio(
                receipt: receipt,
                ownerAccountID: "charlie@example.com"
            )
        )
    }

    private func finalizedReceipt(
        in root: URL
    ) throws -> ProductionAudioRecordingReceipt {
        let recordingID = UUID()
        let captureGroupID = UUID()
        let directory = ProductionAudioRecorder
            .recordingDirectory(
                root: root,
                episodeSpaceID: "episode-5",
                recordingID: recordingID
            )
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let audioURL = directory.appendingPathComponent(
            ProductionAudioRecorder.finalizedAudioFilename
        )
        let bytes = Data("verified-wave-bytes".utf8)
        try bytes.write(to: audioURL)
        let input = CaptureAudioDeviceSnapshot(
            id: "shure-mv7i-uid",
            name: "Shure MV7i",
            manufacturer: "Shure",
            inputChannels: 2,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )
        return ProductionAudioRecordingReceipt(
            recordingID: recordingID,
            configuration: ProductionAudioRecordingConfiguration(
                recordingID: recordingID,
                captureGroupID: captureGroupID,
                episodeSpaceID: "episode-5",
                participantID: "participant-5",
                callRoomID: "room-5",
                recordingConsentID: "consent-5",
                startReceiptID: UUID(),
                projectSlug: "high-ground-odyssey",
                episodeSlug: "episode-5",
                capturePurpose: "PODCAST",
                inputDevice: input,
                rootDirectory: root
            ),
            state: .finalized,
            channelCount: 2,
            startedAt: Date(timeIntervalSince1970: 100),
            stoppedAt: Date(timeIntervalSince1970: 102),
            startedMonotonicNanoseconds: 1_000,
            stoppedMonotonicNanoseconds: 2_000,
            frameCount: 96_000,
            recordingDirectoryPath: directory.path,
            audioPath: audioURL.path,
            partialAudioPath: nil,
            byteCount: Int64(bytes.count),
            sha256:
                "ba234af15d4d1776399b42a7a8f084e79f04a93dc062e2be1d77f7510d5c7415",
            failure: nil
        )
    }

    private func temporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "quipsly-mac-upload-store-\(UUID().uuidString)",
                isDirectory: true
            )
    }
}
#endif
