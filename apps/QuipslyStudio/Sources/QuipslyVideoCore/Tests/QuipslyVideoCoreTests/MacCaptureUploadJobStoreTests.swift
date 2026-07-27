import CryptoKit
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

    func testFinalizedRoomVideoReferenceCreatesDurableVideoJob()
        throws
    {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = try finalizedVideoReceipt(in: root)
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )

        let job = try store.enqueueFinalizedVideoReference(
            receipt: receipt,
            ownerAccountID: "Charlie@Example.com"
        )

        XCTAssertEqual(job.id, receipt.recordingID)
        XCTAssertEqual(job.captureID, receipt.captureGroupID)
        XCTAssertEqual(job.sourceType, "video")
        XCTAssertEqual(job.contentType, "video/quicktime")
        XCTAssertEqual(
            job.trackID,
            "participant-5-camera-reference"
        )
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "eos-webcam-utility"
            )
        )
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "\"includesAudio\" : false"
            )
        )
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "\"monotonicStartedNanoseconds\" : 1000"
            )
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
        XCTAssertEqual(
            reopened.job(
                id: job.id,
                ownerAccountID: "charlie@example.com"
            )?.sourceProfileJSON,
            job.sourceProfileJSON
        )
        XCTAssertEqual(
            reopened.job(
                id: job.id,
                ownerAccountID: "charlie@example.com"
            )?.startReceiptID,
            receipt.startReceiptID
        )
        XCTAssertEqual(
            reopened.job(
                id: job.id,
                ownerAccountID: "charlie@example.com"
            )?.expectedSHA256,
            job.expectedSHA256
        )
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

    func testLocalOnlyVideoReferenceCannotEnterRoomUploadOutbox()
        throws
    {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let roomReceipt = try finalizedVideoReceipt(in: root)
        let localConfiguration =
            ProductionVideoReferenceConfiguration(
                recordingID: roomReceipt.recordingID,
                captureGroupID:
                    roomReceipt.captureGroupID,
                episodeSpaceID:
                    roomReceipt.episodeSpaceID,
                participantID: roomReceipt.participantID,
                videoDevice: roomReceipt.videoDevice,
                rootDirectory: root
            )
        let localReceipt = ProductionVideoReferenceReceipt(
            configuration: localConfiguration,
            state: .finalized,
            negotiatedFormat:
                roomReceipt.negotiatedFormat,
            startedAt: roomReceipt.startedAt,
            stoppedAt: roomReceipt.stoppedAt,
            startedMonotonicNanoseconds:
                roomReceipt.startedMonotonicNanoseconds,
            stoppedMonotonicNanoseconds:
                roomReceipt.stoppedMonotonicNanoseconds,
            durationSeconds:
                roomReceipt.durationSeconds,
            recordingDirectoryPath:
                roomReceipt.recordingDirectoryPath,
            videoPath: roomReceipt.videoPath,
            partialVideoPath: nil,
            byteCount: roomReceipt.byteCount,
            sha256: roomReceipt.sha256,
            failure: nil
        )
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )

        XCTAssertThrowsError(
            try store.enqueueFinalizedVideoReference(
                receipt: localReceipt,
                ownerAccountID: "charlie@example.com"
            )
        )
    }

    func testFinalizedSourceCannotCrossVerifiedOwnerPartition()
        throws
    {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = try finalizedVideoReceipt(in: root)
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )

        XCTAssertThrowsError(
            try store.enqueueFinalizedVideoReference(
                receipt: receipt,
                ownerAccountID: "other@example.com"
            )
        ) { error in
            XCTAssertEqual(
                error as? MacCaptureUploadJobStoreError,
                .sourceOwnerMismatch
            )
        }
    }

    func testVideoUploadCannotArmFromAnUnreadableDurableSourceReceipt()
        throws
    {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = try finalizedVideoReceipt(in: root)
        let receiptURL = URL(
            fileURLWithPath: receipt.recordingDirectoryPath
        )
        .appendingPathComponent(
            ProductionVideoReferenceRecorder.receiptFilename
        )
        try Data(#"{"state":"finalized"}"#.utf8).write(
            to: receiptURL,
            options: .atomic
        )
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )

        XCTAssertThrowsError(
            try store.enqueueFinalizedVideoReference(
                receipt: receipt,
                ownerAccountID: "charlie@example.com"
            )
        ) { error in
            XCTAssertEqual(
                error as? MacCaptureUploadJobStoreError,
                .sourceReceiptMismatch
            )
        }
        XCTAssertTrue(
            store.jobs(
                ownerAccountID: "charlie@example.com"
            ).isEmpty
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
        let receipt = ProductionAudioRecordingReceipt(
            recordingID: recordingID,
            configuration: ProductionAudioRecordingConfiguration(
                recordingID: recordingID,
                captureGroupID: captureGroupID,
                episodeSpaceID: "episode-5",
                participantID: "participant-5",
                ownerAccountID:
                    "charlie@example.com",
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
        try writeReceipt(
            receipt,
            to: directory.appendingPathComponent(
                ProductionAudioRecorder.receiptFilename
            )
        )
        return receipt
    }

    private func finalizedVideoReceipt(
        in root: URL
    ) throws -> ProductionVideoReferenceReceipt {
        let recordingID = UUID()
        let captureGroupID = UUID()
        let directory = ProductionVideoReferenceRecorder
            .recordingDirectory(
                root: root,
                episodeSpaceID: "episode-5",
                recordingID: recordingID
            )
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let videoURL = directory.appendingPathComponent(
            ProductionVideoReferenceRecorder
                .finalizedVideoFilename
        )
        let bytes = Data("verified-movie-bytes".utf8)
        try bytes.write(to: videoURL)
        let digest = SHA256.hash(data: bytes)
            .map { String(format: "%02x", $0) }
            .joined()
        let device = CaptureVideoDeviceSnapshot(
            id: "eos-webcam-utility",
            name: "EOS Webcam Utility",
            manufacturer: "Canon",
            formats: [
                CaptureVideoFormatSnapshot(
                    width: 1_920,
                    height: 1_080,
                    maximumFrameRate: 30,
                    mediaSubType: "420v"
                ),
            ]
        )
        let configuration =
            ProductionVideoReferenceConfiguration(
                recordingID: recordingID,
                captureGroupID: captureGroupID,
                episodeSpaceID: "episode-5",
                participantID: "participant-5",
                ownerAccountID:
                    "charlie@example.com",
                callRoomID: "room-5",
                recordingConsentID: "consent-5",
                startReceiptID: UUID(),
                projectSlug: "high-ground-odyssey",
                episodeSlug: "episode-5",
                capturePurpose: "PODCAST",
                videoDevice: device,
                rootDirectory: root
            )
        let receipt = ProductionVideoReferenceReceipt(
            configuration: configuration,
            state: .finalized,
            negotiatedFormat:
                device.formats[0],
            startedAt: Date(timeIntervalSince1970: 100),
            stoppedAt: Date(timeIntervalSince1970: 102),
            startedMonotonicNanoseconds: 1_000,
            stoppedMonotonicNanoseconds: 2_000,
            durationSeconds: 2,
            recordingDirectoryPath: directory.path,
            videoPath: videoURL.path,
            partialVideoPath: nil,
            byteCount: Int64(bytes.count),
            sha256: digest,
            failure: nil
        )
        try writeReceipt(
            receipt,
            to: directory.appendingPathComponent(
                ProductionVideoReferenceRecorder.receiptFilename
            )
        )
        return receipt
    }

    private func writeReceipt<T: Encodable>(
        _ receipt: T,
        to url: URL
    ) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [
            .prettyPrinted,
            .sortedKeys,
            .withoutEscapingSlashes,
        ]
        try encoder.encode(receipt).write(
            to: url,
            options: .atomic
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
