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
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "\"monotonicStartedNanoseconds\" : \"1000\""
            )
        )
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "\"deviceMonotonicSentNanoseconds\" : \"500\""
            )
        )
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "\"sampleId\" : \"00000000-0000-0000-0000-000000000101\""
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
                "\"monotonicStartedNanoseconds\" : \"1000\""
            )
        )
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "\"deviceMonotonicSentNanoseconds\" : \"500\""
            )
        )
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "\"sampleId\" : \"00000000-0000-0000-0000-000000000101\""
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

    func testRoomBoundCanonCardOriginalCreatesDurableVideoJob()
        throws
    {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = try finalizedCanonReceipt(
            in: root,
            roomBound: true
        )
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )

        let job = try store.enqueueFinalizedCanonCardOriginal(
            receipt: receipt,
            ownerAccountID: "Charlie@Example.com"
        )

        XCTAssertEqual(job.id, receipt.importID)
        XCTAssertEqual(job.captureID, receipt.captureGroupID)
        XCTAssertEqual(job.sourceType, "video")
        XCTAssertEqual(job.contentType, "video/mp4")
        XCTAssertEqual(
            job.trackID,
            "participant-5-camera-card-master"
        )
        XCTAssertEqual(
            job.startReceiptID,
            receipt.roomBinding?.startReceiptID
        )
        XCTAssertEqual(
            job.startedAt,
            receipt.sourceCreatedAt
        )
        XCTAssertEqual(
            job.stoppedAt.timeIntervalSince(job.startedAt),
            receipt.technicalProbe.durationSeconds,
            accuracy: 0.001
        )
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "\"sourceKind\" : \"camera_card_original\""
            )
        )
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "\"captureTimingEvidence\" : \"card-file-creation-date-unreviewed\""
            )
        )
        XCTAssertTrue(
            job.sourceProfileJSON.contains(
                "\"cardByteIdentityVerified\" : true"
            )
        )
        XCTAssertFalse(
            job.sourceProfileJSON.contains("clockSamples")
        )
        let evidence =
            try MacCaptureUploadJobStore.exactSourceEvidence(
                for: job
            )
        XCTAssertEqual(evidence.sizeBytes, job.expectedSizeBytes)
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
        XCTAssertEqual(
            reopenedJob.sourceProfileJSON,
            job.sourceProfileJSON
        )
        XCTAssertEqual(
            reopenedJob.startReceiptID,
            job.startReceiptID
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

    func testLocalOnlyCanonCardOriginalCannotEnterRoomUploadOutbox()
        throws
    {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = try finalizedCanonReceipt(
            in: root,
            roomBound: false
        )
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )

        XCTAssertThrowsError(
            try store.enqueueFinalizedCanonCardOriginal(
                receipt: receipt,
                ownerAccountID: "charlie@example.com"
            )
        ) { error in
            XCTAssertEqual(
                error as? MacCaptureUploadJobStoreError,
                .roomAuthorityMissing
            )
        }
        XCTAssertTrue(
            store.jobs(
                ownerAccountID: "charlie@example.com"
            ).isEmpty
        )
    }

    func testCanonCardUploadRejectsReceiptWithoutCardToManagedByteIdentity()
        throws
    {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = try finalizedCanonReceipt(
            in: root,
            roomBound: true,
            cardDigestMatches: false
        )
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )

        XCTAssertThrowsError(
            try store.enqueueFinalizedCanonCardOriginal(
                receipt: receipt,
                ownerAccountID: "charlie@example.com"
            )
        ) { error in
            XCTAssertEqual(
                error as? MacCaptureUploadJobStoreError,
                .sourceReceiptMismatch
            )
        }
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
                clockSamples: [
                    captureClockSample(
                        callRoomID: "room-5",
                        captureGroupID: captureGroupID
                    ),
                ],
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
                clockSamples: [
                    captureClockSample(
                        callRoomID: "room-5",
                        captureGroupID: captureGroupID
                    ),
                ],
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

    private func captureClockSample(
        callRoomID: String,
        captureGroupID: UUID
    ) -> ProductionCaptureClockSample {
        ProductionCaptureClockSample(
            protocolVersion: 1,
            sampleId: UUID(
                uuidString:
                    "00000000-0000-0000-0000-000000000101"
            )!,
            callRoomId: callRoomID,
            captureGroupId: captureGroupID,
            clientKind: "macos",
            deviceWallSentAt:
                Date(timeIntervalSince1970: 99.5),
            deviceMonotonicSentNanoseconds: 500,
            serverReceivedAt:
                Date(timeIntervalSince1970: 99.51),
            serverSentAt:
                Date(timeIntervalSince1970: 99.511),
            deviceWallReceivedAt:
                Date(timeIntervalSince1970: 99.521),
            deviceMonotonicReceivedNanoseconds: 521,
            networkRoundTripMilliseconds: 20,
            serverOffsetMilliseconds: 0.5,
            uncertaintyMilliseconds: 10,
            wallClockDiscontinuityMilliseconds: 0
        )
    }

    private func finalizedCanonReceipt(
        in root: URL,
        roomBound: Bool,
        cardDigestMatches: Bool = true
    ) throws -> CanonCardImportReceipt {
        let importID = UUID()
        let captureGroupID = UUID()
        let sourceURL = root.appendingPathComponent(
            "canon-card-source.mp4"
        )
        let directory = CanonCardImporter.importDirectory(
            root: root,
            episodeSpaceID: "episode-5",
            importID: importID
        )
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let managedURL = directory.appendingPathComponent(
            "canon-card-source.mp4"
        )
        let bytes = Data("verified-canon-card-bytes".utf8)
        try bytes.write(to: sourceURL)
        try bytes.write(to: managedURL)
        let digest = SHA256.hash(data: bytes)
            .map { String(format: "%02x", $0) }
            .joined()
        let binding = roomBound
            ? ProductionCaptureRoomBinding(
                captureGroupID: captureGroupID,
                episodeSpaceID: "episode-5",
                participantID: "participant-5",
                ownerAccountID: "charlie@example.com",
                callRoomID: "room-5",
                recordingConsentID: "consent-5",
                startReceiptID: UUID(),
                projectSlug: "high-ground-odyssey",
                episodeSlug: "episode-5",
                capturePurpose: "PODCAST"
            )
            : nil
        let configuration = CanonCardImportConfiguration(
            importID: importID,
            captureGroupID: captureGroupID,
            episodeSpaceID: "episode-5",
            participantID: "participant-5",
            roomBinding: binding,
            sourceURL: sourceURL,
            rootDirectory: root
        )
        let receiptURL = directory.appendingPathComponent(
            CanonCardImporter.receiptFilename
        )
        let receipt = CanonCardImportReceipt(
            configuration: configuration,
            state: .finalized,
            sourceVolumeIdentifier: "canon-card-volume",
            sourceCreatedAt:
                Date(timeIntervalSince1970: 90),
            sourceModifiedAt:
                Date(timeIntervalSince1970: 92),
            sourceByteCount: Int64(bytes.count),
            managedOriginalPath: managedURL.path,
            partialManagedOriginalPath: nil,
            receiptPath: receiptURL.path,
            sourceSHA256:
                cardDigestMatches
                    ? digest
                    : String(repeating: "0", count: 64),
            managedOriginalSHA256: digest,
            managedOriginalByteCount: Int64(bytes.count),
            byteIdentityVerified: true,
            startedAt: Date(timeIntervalSince1970: 100),
            stoppedAt: Date(timeIntervalSince1970: 102),
            startedMonotonicNanoseconds: 1_000,
            stoppedMonotonicNanoseconds: 2_000,
            technicalProbe: CanonCardMediaProbe(
                durationSeconds: 2,
                width: 3_840,
                height: 2_160,
                nominalFrameRate: 29.97,
                videoCodec: "hvc1",
                videoTrackCount: 1,
                audioTrackCount: 1,
                timecodeTrackCount: 1,
                audioSampleRate: 48_000,
                audioChannelCount: 2
            ),
            episodeAttachmentState:
                "ready-for-local-editor-attachment",
            alignmentState: "needs-alignment",
            failure: nil
        )
        try writeReceipt(receipt, to: receiptURL)
        return receipt
    }

    private func writeReceipt<T: Encodable>(
        _ receipt: T,
        to url: URL
    ) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom(
            ProductionCaptureDateCoding.encode
        )
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
