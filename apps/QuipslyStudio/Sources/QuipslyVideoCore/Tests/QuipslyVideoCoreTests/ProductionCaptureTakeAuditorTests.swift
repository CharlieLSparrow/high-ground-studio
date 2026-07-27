import AVFoundation
import CryptoKit
import Foundation
import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
final class ProductionCaptureTakeAuditorTests: XCTestCase {
    func testRealMediaPairProducesAppendOnlyMachineAudit()
        async throws
    {
        let fixture = try makeFixture()
        defer {
            try? FileManager.default.removeItem(
                at: fixture.root
            )
        }
        let auditID = UUID()

        let receipt = try await ProductionCaptureTakeAuditor
            .audit(
                audio: fixture.audio,
                video: fixture.video,
                rootDirectory: fixture.root,
                auditID: auditID,
                generatedAt:
                    Date(timeIntervalSince1970: 1_000)
            )

        XCTAssertEqual(
            receipt.disposition,
            .machinePassHumanReviewRequired
        )
        XCTAssertEqual(receipt.holdCount, 0)
        XCTAssertEqual(receipt.warningCount, 1)
        XCTAssertTrue(
            receipt.checks.contains {
                $0.id == "clock-evidence-present"
                    && $0.status == .warning
            }
        )
        XCTAssertEqual(
            receipt.audio.audioProbe?.sampleRate,
            48_000
        )
        XCTAssertEqual(receipt.audio.audioProbe?.bitDepth, 24)
        XCTAssertEqual(receipt.video.videoProbe?.width, 1_920)
        XCTAssertEqual(receipt.video.videoProbe?.height, 1_080)
        XCTAssertEqual(receipt.video.videoProbe?.audioTrackCount, 0)
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: receipt.receiptPath
            )
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(
            ProductionCaptureDateCoding.decode
        )
        let persisted = try decoder.decode(
            ProductionCaptureTakeAuditReceipt.self,
            from: Data(
                contentsOf: URL(
                    fileURLWithPath: receipt.receiptPath
                )
            )
        )
        XCTAssertEqual(persisted, receipt)
        do {
            _ = try await ProductionCaptureTakeAuditor.audit(
                audio: fixture.audio,
                video: fixture.video,
                rootDirectory: fixture.root,
                auditID: auditID
            )
            XCTFail(
                "A second audit must not overwrite the append-only receipt."
            )
        } catch {
            XCTAssertEqual(
                error as? ProductionCaptureTakeAuditorError,
                .receiptCollision
            )
        }
    }

    func testFreshByteReadHoldsMutatedAudio()
        async throws
    {
        let fixture = try makeFixture()
        defer {
            try? FileManager.default.removeItem(
                at: fixture.root
            )
        }
        let audioURL = URL(
            fileURLWithPath: fixture.audio.audioPath
        )
        let handle = try FileHandle(
            forWritingTo: audioURL
        )
        try handle.seekToEnd()
        try handle.write(
            contentsOf: Data("drift".utf8)
        )
        try handle.close()

        let receipt = try await ProductionCaptureTakeAuditor
            .audit(
                audio: fixture.audio,
                video: fixture.video,
                rootDirectory: fixture.root
            )

        XCTAssertEqual(receipt.disposition, .held)
        XCTAssertTrue(
            receipt.checks.contains {
                $0.id == "audio-byte-count"
                    && $0.status == .hold
            }
        )
        XCTAssertTrue(
            receipt.checks.contains {
                $0.id == "audio-sha256"
                    && $0.status == .hold
            }
        )
    }

    func testRoomBoundPairRejectsDivergentClockBurst()
        async throws
    {
        let fixture = try makeFixture(
            roomBound: true,
            divergentClockBurst: true
        )
        defer {
            try? FileManager.default.removeItem(
                at: fixture.root
            )
        }

        let receipt = try await ProductionCaptureTakeAuditor
            .audit(
                audio: fixture.audio,
                video: fixture.video,
                rootDirectory: fixture.root
            )

        XCTAssertEqual(receipt.disposition, .held)
        XCTAssertEqual(
            receipt.roomBinding,
            fixture.audio.roomBinding
        )
        XCTAssertTrue(receipt.sharedClockSamples.isEmpty)
        XCTAssertTrue(
            receipt.checks.contains {
                $0.id == "shared-clock-burst"
                    && $0.status == .hold
            }
        )
        XCTAssertTrue(
            receipt.checks.contains {
                $0.id == "same-room-authority"
                    && $0.status == .pass
            }
        )
    }

    func testCrossTakeAndMediaShapeDriftAreHeld()
        async throws
    {
        let fixture = try makeFixture(
            mismatchedTakeIdentity: true,
            mismatchedVideoShape: true
        )
        defer {
            try? FileManager.default.removeItem(
                at: fixture.root
            )
        }

        let receipt = try await ProductionCaptureTakeAuditor
            .audit(
                audio: fixture.audio,
                video: fixture.video,
                rootDirectory: fixture.root
            )

        XCTAssertEqual(receipt.disposition, .held)
        XCTAssertTrue(
            receipt.checks.contains {
                $0.id == "same-take-identity"
                    && $0.status == .hold
            }
        )
        XCTAssertTrue(
            receipt.checks.contains {
                $0.id == "video-reference-shape"
                    && $0.status == .hold
            }
        )
        XCTAssertTrue(
            receipt.checks.contains {
                $0.id == "video-duration"
                    && $0.status == .hold
            }
        )
    }

    private struct Fixture {
        let root: URL
        let audio: ProductionAudioRecordingReceipt
        let video: ProductionVideoReferenceReceipt
    }

    private func makeFixture(
        roomBound: Bool = false,
        divergentClockBurst: Bool = false,
        mismatchedTakeIdentity: Bool = false,
        mismatchedVideoShape: Bool = false
    ) throws -> Fixture {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                UUID().uuidString,
                isDirectory: true
            )
        try FileManager.default.createDirectory(
            at: root,
            withIntermediateDirectories: true
        )
        let audioURL = root.appendingPathComponent(
            "local-mic-master.wav"
        )
        var writer: AVAudioFile? = try AVAudioFile(
            forWriting: audioURL,
            settings:
                ProductionAudioRecorder
                    .localMasterFileSettings(
                        channelCount: 1
                    ),
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        )
        let audioFormat = try XCTUnwrap(
            AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: 48_000,
                channels: 1,
                interleaved: false
            )
        )
        let buffer = try XCTUnwrap(
            AVAudioPCMBuffer(
                pcmFormat: audioFormat,
                frameCapacity: 4_800
            )
        )
        buffer.frameLength = 4_800
        try writer?.write(from: buffer)
        writer = nil

        let videoURL = root.appendingPathComponent(
            "local-camera-reference.mov"
        )
        let fixtureVideo = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../Charlie.mp4")
            .standardizedFileURL
        try FileManager.default.copyItem(
            at: fixtureVideo,
            to: videoURL
        )

        let captureGroupID = UUID()
        let startReceiptID = UUID()
        let audioSamples = roomBound
            ? [
                clockSample(
                    id: UUID(),
                    captureGroupID: captureGroupID
                ),
            ]
            : []
        let videoSamples =
            divergentClockBurst && roomBound
                ? [
                    clockSample(
                        id: UUID(),
                        captureGroupID: captureGroupID
                    ),
                ]
                : audioSamples
        let input = CaptureAudioDeviceSnapshot(
            id: "fixture-input",
            name: "Fixture 48 kHz input",
            inputChannels: 1,
            outputChannels: 0,
            nominalSampleRate: 48_000
        )
        let audioConfiguration =
            ProductionAudioRecordingConfiguration(
                captureGroupID: captureGroupID,
                episodeSpaceID: "episode-5",
                participantID: "charlie",
                ownerAccountID:
                    roomBound
                        ? "charlie@example.com"
                        : nil,
                callRoomID:
                    roomBound ? "room-5" : nil,
                recordingConsentID:
                    roomBound ? "consent-5" : nil,
                startReceiptID:
                    roomBound ? startReceiptID : nil,
                projectSlug:
                    roomBound
                        ? "high-ground-odyssey"
                        : nil,
                episodeSlug:
                    roomBound ? "episode-5" : nil,
                capturePurpose:
                    roomBound ? "PODCAST" : nil,
                clockSamples: audioSamples,
                inputDevice: input,
                rootDirectory: root
            )
        let audioReceipt =
            ProductionAudioRecordingReceipt(
                recordingID:
                    audioConfiguration.recordingID,
                configuration: audioConfiguration,
                state: .finalized,
                channelCount: 1,
                startedAt:
                    Date(timeIntervalSince1970: 100),
                stoppedAt:
                    Date(timeIntervalSince1970: 100.1),
                startedMonotonicNanoseconds:
                    1_000_000_000,
                stoppedMonotonicNanoseconds:
                    1_100_000_000,
                frameCount: 4_800,
                recordingDirectoryPath: root.path,
                audioPath: audioURL.path,
                partialAudioPath: nil,
                byteCount: try byteCount(at: audioURL),
                sha256: try digest(at: audioURL),
                failure: nil
            )

        let videoDevice = CaptureVideoDeviceSnapshot(
            id: "fixture-camera",
            name: "Fixture camera",
            formats: [
                CaptureVideoFormatSnapshot(
                    width:
                        mismatchedVideoShape
                            ? 1_280
                            : 1_920,
                    height: 1_080,
                    maximumFrameRate: 30,
                    mediaSubType: "avc1"
                ),
            ]
        )
        let videoConfiguration =
            ProductionVideoReferenceConfiguration(
                captureGroupID:
                    mismatchedTakeIdentity
                        ? UUID()
                        : captureGroupID,
                episodeSpaceID: "episode-5",
                participantID: "charlie",
                ownerAccountID:
                    roomBound
                        ? "charlie@example.com"
                        : nil,
                callRoomID:
                    roomBound ? "room-5" : nil,
                recordingConsentID:
                    roomBound ? "consent-5" : nil,
                startReceiptID:
                    roomBound ? startReceiptID : nil,
                projectSlug:
                    roomBound
                        ? "high-ground-odyssey"
                        : nil,
                episodeSlug:
                    roomBound ? "episode-5" : nil,
                capturePurpose:
                    roomBound ? "PODCAST" : nil,
                clockSamples: videoSamples,
                videoDevice: videoDevice,
                rootDirectory: root
            )
        let videoReceipt =
            ProductionVideoReferenceReceipt(
                configuration: videoConfiguration,
                state: .finalized,
                negotiatedFormat:
                    videoDevice.formats[0],
                startedAt:
                    Date(timeIntervalSince1970: 99.9),
                stoppedAt:
                    Date(timeIntervalSince1970: 129.9),
                startedMonotonicNanoseconds:
                    900_000_000,
                stoppedMonotonicNanoseconds:
                    30_900_000_000,
                durationSeconds:
                    mismatchedVideoShape ? 31 : 30,
                recordingDirectoryPath: root.path,
                videoPath: videoURL.path,
                partialVideoPath: nil,
                byteCount: try byteCount(at: videoURL),
                sha256: try digest(at: videoURL),
                failure: nil
            )
        return Fixture(
            root: root,
            audio: audioReceipt,
            video: videoReceipt
        )
    }

    private func clockSample(
        id: UUID,
        captureGroupID: UUID
    ) -> ProductionCaptureClockSample {
        ProductionCaptureClockSample(
            protocolVersion: 1,
            sampleId: id,
            callRoomId: "room-5",
            captureGroupId: captureGroupID,
            clientKind: "macos",
            deviceWallSentAt:
                Date(timeIntervalSince1970: 99),
            deviceMonotonicSentNanoseconds:
                500_000_000,
            serverReceivedAt:
                Date(timeIntervalSince1970: 99.01),
            serverSentAt:
                Date(timeIntervalSince1970: 99.02),
            deviceWallReceivedAt:
                Date(timeIntervalSince1970: 99.03),
            deviceMonotonicReceivedNanoseconds:
                530_000_000,
            networkRoundTripMilliseconds: 20,
            serverOffsetMilliseconds: 0,
            uncertaintyMilliseconds: 10,
            wallClockDiscontinuityMilliseconds: 0
        )
    }

    private func byteCount(
        at url: URL
    ) throws -> Int64 {
        Int64(
            try XCTUnwrap(
                url.resourceValues(
                    forKeys: [.fileSizeKey]
                ).fileSize
            )
        )
    }

    private func digest(
        at url: URL
    ) throws -> String {
        SHA256.hash(data: try Data(contentsOf: url))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}
#endif
