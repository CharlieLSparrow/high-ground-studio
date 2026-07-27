import Foundation
import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
final class ProductionVideoReferenceRecorderTests: XCTestCase {
    private let referenceFormat = CaptureVideoFormatSnapshot(
        width: 1_920,
        height: 1_080,
        maximumFrameRate: 30,
        mediaSubType: "420v"
    )

    private var eosWebcamUtility = CaptureVideoDeviceSnapshot(
        id: "eos-webcam-utility",
        name: "EOS Webcam Utility",
        manufacturer: "Canon",
        formats: [
            CaptureVideoFormatSnapshot(
                width: 1_920,
                height: 1_080,
                maximumFrameRate: 30,
                mediaSubType: "420v"
            )
        ]
    )

    func testFinalizedReceiptPreservesBoundaryAndNeverClaimsCanonCardMaster() {
        let recordingID = UUID()
        let captureGroupID = UUID()
        let configuration = ProductionVideoReferenceConfiguration(
            recordingID: recordingID,
            captureGroupID: captureGroupID,
            episodeSpaceID: "hgo-episode-5",
            participantID: "charlie",
            callRoomID: "livekit-room-5",
            recordingConsentID: "consent-5",
            startReceiptID: UUID(),
            projectSlug: "high-ground-odyssey",
            episodeSlug: "episode-5",
            capturePurpose: "podcast",
            videoDevice: eosWebcamUtility,
            rootDirectory: URL(fileURLWithPath: "/tmp/quipsly-tests")
        )

        let receipt = ProductionVideoReferenceReceipt(
            configuration: configuration,
            state: .finalized,
            negotiatedFormat: referenceFormat,
            startedAt: Date(timeIntervalSince1970: 1_000),
            stoppedAt: Date(timeIntervalSince1970: 1_010),
            startedMonotonicNanoseconds: 1_000_000_000,
            stoppedMonotonicNanoseconds: 11_000_000_000,
            durationSeconds: 10,
            recordingDirectoryPath: "/tmp/quipsly-tests/hgo-episode-5/take",
            videoPath: "/tmp/quipsly-tests/hgo-episode-5/take/local-camera-reference.mov",
            partialVideoPath: nil,
            byteCount: 1_024,
            sha256: String(repeating: "a", count: 64),
            failure: nil
        )

        XCTAssertEqual(receipt.recordingID, recordingID)
        XCTAssertEqual(receipt.captureGroupID, captureGroupID)
        XCTAssertEqual(receipt.recordingConsentID, "consent-5")
        XCTAssertEqual(receipt.sourceKind, "local_video_reference")
        XCTAssertEqual(receipt.state, .finalized)
        XCTAssertFalse(receipt.containsAudio)
        XCTAssertEqual(receipt.negotiatedFormat, referenceFormat)
        XCTAssertTrue(receipt.truth.contains("exact selected macOS route"))
        XCTAssertTrue(
            receipt.truth.contains(
                "not proof of a Canon camera-card 4K master"
            )
        )
    }

    func testInterruptedScannerFindsPreservedPartialMovieAndReceipt() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let recordingID = UUID()
        let configuration = ProductionVideoReferenceConfiguration(
            recordingID: recordingID,
            captureGroupID: UUID(),
            episodeSpaceID: "hgo-episode-5",
            participantID: "charlie",
            videoDevice: eosWebcamUtility,
            rootDirectory: root
        )
        let directory = ProductionVideoReferenceRecorder.recordingDirectory(
            root: root,
            episodeSpaceID: configuration.episodeSpaceID,
            recordingID: recordingID
        )
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let partialURL = directory.appendingPathComponent(
            ProductionVideoReferenceRecorder.partialVideoFilename
        )
        try Data("preserved partial movie".utf8).write(to: partialURL)

        let receiptURL = directory.appendingPathComponent(
            ProductionVideoReferenceRecorder.receiptFilename
        )
        let receipt = ProductionVideoReferenceReceipt(
            configuration: configuration,
            state: .inProgress,
            negotiatedFormat: referenceFormat,
            startedAt: Date(timeIntervalSince1970: 1_000),
            stoppedAt: nil,
            startedMonotonicNanoseconds: 1_000_000_000,
            stoppedMonotonicNanoseconds: nil,
            durationSeconds: 0,
            recordingDirectoryPath: directory.path,
            videoPath: directory.appendingPathComponent(
                ProductionVideoReferenceRecorder.finalizedVideoFilename
            ).path,
            partialVideoPath: partialURL.path,
            byteCount: nil,
            sha256: nil,
            failure: nil
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(receipt).write(to: receiptURL, options: [.atomic])

        let interrupted =
            ProductionVideoReferenceRecorder.interruptedRecordings(in: root)

        XCTAssertEqual(interrupted.count, 1)
        XCTAssertEqual(interrupted.first?.id, recordingID)
        XCTAssertEqual(
            interrupted.first?.preservedVideoURL.resolvingSymlinksInPath(),
            partialURL.resolvingSymlinksInPath()
        )
        XCTAssertEqual(interrupted.first?.receipt, receipt)
    }

    func testInterruptedScannerFindsFinalMovieWhenReceiptWriteDidNotFinish()
        throws
    {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let recordingID = UUID()
        let directory = ProductionVideoReferenceRecorder.recordingDirectory(
            root: root,
            episodeSpaceID: "hgo-episode-5",
            recordingID: recordingID
        )
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let finalizedURL = directory.appendingPathComponent(
            ProductionVideoReferenceRecorder.finalizedVideoFilename
        )
        try Data("moved but receipt not finalized".utf8).write(
            to: finalizedURL
        )

        let interrupted =
            ProductionVideoReferenceRecorder.interruptedRecordings(in: root)

        XCTAssertEqual(interrupted.count, 1)
        XCTAssertEqual(interrupted.first?.id, recordingID)
        XCTAssertEqual(
            interrupted.first?.preservedVideoURL.resolvingSymlinksInPath(),
            finalizedURL.resolvingSymlinksInPath()
        )
        XCTAssertNil(interrupted.first?.receipt)
    }
}
#endif
