import Foundation
import CoreMedia
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

    func testFixedRateDriverUsesAdvertisedFormatDefaultWithoutDurationSetter() {
        let plan = ProductionVideoReferenceRecorder.frameDurationPlan(
            frameRate: 30,
            supportedRanges: [(minimum: 30, maximum: 30)]
        )

        XCTAssertEqual(plan, .formatDefault)
    }

    func testVariableRateDriverReceivesOneFiniteDurationForBothSetters() {
        let plan = ProductionVideoReferenceRecorder.frameDurationPlan(
            frameRate: 30,
            supportedRanges: [(minimum: 15, maximum: 60)]
        )

        guard case .explicit(let duration) = plan else {
            return XCTFail("Expected an explicit finite frame duration.")
        }
        XCTAssertGreaterThan(duration.value, 0)
        XCTAssertGreaterThan(duration.timescale, 0)
        XCTAssertEqual(CMTimeGetSeconds(duration), 1 / 30, accuracy: 0.000_001)
    }

    func testInvalidOrUnadvertisedFrameRateFailsClosed() {
        XCTAssertEqual(
            ProductionVideoReferenceRecorder.frameDurationPlan(
                frameRate: .nan,
                supportedRanges: [(minimum: 30, maximum: 30)]
            ),
            .unsupported
        )
        XCTAssertEqual(
            ProductionVideoReferenceRecorder.frameDurationPlan(
                frameRate: 30,
                supportedRanges: [(minimum: 60, maximum: 60)]
            ),
            .unsupported
        )
    }

    func testFinalizedReceiptPreservesBoundaryAndNeverClaimsCanonCardMaster() {
        let recordingID = UUID()
        let captureGroupID = UUID()
        let configuration = ProductionVideoReferenceConfiguration(
            recordingID: recordingID,
            captureGroupID: captureGroupID,
            episodeSpaceID: "hgo-episode-5",
            participantID: "charlie",
            ownerAccountID: "charlie@example.com",
            callRoomID: "livekit-room-5",
            recordingConsentID: "consent-5",
            startReceiptID: UUID(),
            projectSlug: "high-ground-odyssey",
            episodeSlug: "episode-5",
            capturePurpose: "podcast",
            videoDevice: eosWebcamUtility,
            signalVerification:
                ProductionVideoSignalVerification(
                    deviceID: eosWebcamUtility.id,
                    method: .operatorLivePreview,
                    verifiedAt:
                        Date(timeIntervalSince1970: 999)
                ),
            rootDirectory: URL(fileURLWithPath: "/tmp/quipsly-tests")
        )

        let receipt = ProductionVideoReferenceReceipt(
            configuration: configuration,
            state: .finalized,
            negotiatedFormat: referenceFormat,
            recordedFormat:
                ProductionVideoRecordedFormat(
                    width: 1_920,
                    height: 1_080,
                    nominalFrameRate: 29.97,
                    codec: "avc1"
                ),
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
        XCTAssertEqual(
            receipt.ownerAccountID,
            "charlie@example.com"
        )
        XCTAssertEqual(receipt.recordingConsentID, "consent-5")
        XCTAssertEqual(receipt.sourceKind, "local_video_reference")
        XCTAssertEqual(receipt.state, .finalized)
        XCTAssertEqual(receipt.protocolVersion, 3)
        XCTAssertFalse(receipt.containsAudio)
        XCTAssertEqual(receipt.negotiatedFormat, referenceFormat)
        XCTAssertEqual(receipt.recordedFormat?.codec, "avc1")
        XCTAssertEqual(
            receipt.signalVerification?.method,
            .operatorLivePreview
        )
        XCTAssertTrue(receipt.truth.contains("exact selected macOS route"))
        XCTAssertTrue(
            receipt.truth.contains(
                "fresh preflight live-image confirmation"
            )
        )
        XCTAssertTrue(
            receipt.truth.contains(
                "not proof of a Canon camera-card 4K master"
            )
        )
    }

    func testLiveSignalVerificationIsExactFreshAndPreStart() {
        let verification = ProductionVideoSignalVerification(
            deviceID: eosWebcamUtility.id,
            method: .agentVisualReview,
            verifiedAt: Date(timeIntervalSince1970: 1_000)
        )

        XCTAssertTrue(
            verification.isValid(
                for: eosWebcamUtility.id,
                recordingStartedAt:
                    Date(timeIntervalSince1970: 1_120)
            )
        )
        XCTAssertFalse(
            verification.isValid(
                for: "another-camera",
                recordingStartedAt:
                    Date(timeIntervalSince1970: 1_120)
            )
        )
        XCTAssertFalse(
            verification.isValid(
                for: eosWebcamUtility.id,
                recordingStartedAt:
                    Date(timeIntervalSince1970: 1_301)
            )
        )
        XCTAssertFalse(
            verification.isValid(
                for: eosWebcamUtility.id,
                recordingStartedAt:
                    Date(timeIntervalSince1970: 999)
            )
        )
    }

    func testReceiptDecodesWhenLegacyJSONOmitsRecordedFormat()
        throws
    {
        let configuration =
            ProductionVideoReferenceConfiguration(
                episodeSpaceID: "legacy-episode",
                participantID: "charlie",
                videoDevice: eosWebcamUtility
            )
        let receipt = ProductionVideoReferenceReceipt(
            configuration: configuration,
            state: .inProgress,
            negotiatedFormat: referenceFormat,
            startedAt: Date(timeIntervalSince1970: 1_000),
            stoppedAt: nil,
            startedMonotonicNanoseconds: 1_000,
            stoppedMonotonicNanoseconds: nil,
            durationSeconds: 0,
            recordingDirectoryPath: "/tmp/legacy",
            videoPath: "/tmp/legacy/reference.mov",
            partialVideoPath: "/tmp/legacy/reference.partial.mov",
            byteCount: nil,
            sha256: nil,
            failure: nil
        )
        let encoded = try JSONEncoder().encode(receipt)
        var json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: encoded)
                as? [String: Any]
        )
        json.removeValue(forKey: "recordedFormat")
        json["protocolVersion"] = 1
        let legacyData = try JSONSerialization.data(
            withJSONObject: json
        )

        let decoded = try JSONDecoder().decode(
            ProductionVideoReferenceReceipt.self,
            from: legacyData
        )

        XCTAssertNil(decoded.recordedFormat)
        XCTAssertEqual(decoded.protocolVersion, 1)
        XCTAssertEqual(
            decoded.negotiatedFormat,
            referenceFormat
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
