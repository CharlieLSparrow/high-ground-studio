import AVFoundation
import AudioToolbox
import Foundation
import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
final class ProductionAudioRecorderTests: XCTestCase {
    func testSafePathComponentCannotEscapeCaptureRoot() {
        XCTAssertEqual(
            ProductionAudioRecorder.safePathComponent(
                " ../../High Ground Odyssey / Episode 05 "
            ),
            "high-ground-odyssey-episode-05"
        )
        XCTAssertEqual(
            ProductionAudioRecorder.safePathComponent("   "),
            "untitled-episode"
        )
    }

    func testRecordingDirectoryKeepsEpisodeAndTakeIdentity() {
        let root = URL(fileURLWithPath: "/tmp/quipsly-captures")
        let recordingID = UUID(
            uuidString: "594E4B70-8246-4555-B932-7C4EFA62D526"
        )!
        let directory = ProductionAudioRecorder.recordingDirectory(
            root: root,
            episodeSpaceID: "HGO Episode 5",
            recordingID: recordingID
        )

        XCTAssertEqual(
            directory.path,
            "/tmp/quipsly-captures/hgo-episode-5/594e4b70-8246-4555-b932-7c4efa62d526"
        )
    }

    func testInterruptedTakeIsPreservedAndDiscoverable() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let recordingID = UUID()
        let input = CaptureAudioDeviceSnapshot(
            id: "shure-mv7i-uid",
            name: "Shure MV7i",
            manufacturer: "Shure",
            inputChannels: 2,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )
        let configuration = ProductionAudioRecordingConfiguration(
            captureGroupID: UUID(),
            episodeSpaceID: "episode-5",
            participantID: "charlie",
            inputDevice: input,
            rootDirectory: root
        )
        let directory = ProductionAudioRecorder.recordingDirectory(
            root: root,
            episodeSpaceID: configuration.episodeSpaceID,
            recordingID: recordingID
        )
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let partialURL = directory.appendingPathComponent(
            ProductionAudioRecorder.partialAudioFilename
        )
        try Data("partial-wav".utf8).write(to: partialURL)
        let receipt = ProductionAudioRecordingReceipt(
            recordingID: recordingID,
            configuration: configuration,
            state: .inProgress,
            channelCount: 2,
            startedAt: Date(timeIntervalSince1970: 100),
            stoppedAt: nil,
            startedMonotonicNanoseconds: 42,
            stoppedMonotonicNanoseconds: nil,
            frameCount: 4_800,
            recordingDirectoryPath: directory.path,
            audioPath: directory
                .appendingPathComponent(
                    ProductionAudioRecorder.finalizedAudioFilename
                )
                .path,
            partialAudioPath: partialURL.path,
            byteCount: nil,
            sha256: nil,
            failure: nil
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(receipt).write(
            to: directory.appendingPathComponent(
                ProductionAudioRecorder.receiptFilename
            )
        )

        let recovered = ProductionAudioRecorder.interruptedRecordings(in: root)

        XCTAssertEqual(recovered.count, 1)
        XCTAssertEqual(recovered.first?.id, recordingID)
        XCTAssertEqual(recovered.first?.receipt?.state, .inProgress)
        XCTAssertEqual(
            recovered.first?.partialAudioURL.resolvingSymlinksInPath(),
            partialURL.resolvingSymlinksInPath()
        )
        XCTAssertTrue(FileManager.default.fileExists(atPath: partialURL.path))
    }

    func testFinalizedReceiptCarriesSyncAndIntegrityBoundaries() {
        let input = CaptureAudioDeviceSnapshot(
            id: "shure-mv7i-uid",
            name: "Shure MV7i",
            manufacturer: "Shure",
            inputChannels: 2,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )
        let configuration = ProductionAudioRecordingConfiguration(
            captureGroupID: UUID(),
            episodeSpaceID: "episode-5",
            participantID: "charlie",
            inputDevice: input,
            rootDirectory: URL(fileURLWithPath: "/tmp")
        )
        let receipt = ProductionAudioRecordingReceipt(
            recordingID: UUID(),
            configuration: configuration,
            state: .finalized,
            channelCount: 2,
            startedAt: Date(timeIntervalSince1970: 100),
            stoppedAt: Date(timeIntervalSince1970: 102),
            startedMonotonicNanoseconds: 1_000,
            stoppedMonotonicNanoseconds: 2_000,
            frameCount: 96_000,
            recordingDirectoryPath: "/tmp/take",
            audioPath: "/tmp/take/local-mic-master.wav",
            partialAudioPath: nil,
            byteCount: 576_044,
            sha256: String(repeating: "a", count: 64),
            failure: nil
        )

        XCTAssertEqual(receipt.durationSeconds, 2, accuracy: 0.000_001)
        XCTAssertEqual(receipt.targetSampleRate, 48_000)
        XCTAssertEqual(receipt.targetBitDepth, 24)
        XCTAssertEqual(receipt.sourceKind, "local_audio_master")
        XCTAssertNil(receipt.partialAudioPath)
        XCTAssertTrue(receipt.truth.contains("finalized"))
    }

    func testVirtualRouteReceiptDoesNotClaimPhysicalMV7iProof() {
        let input = CaptureAudioDeviceSnapshot(
            id: "motiv-mix-virtual-uid",
            name: "MOTIV Mix Virtual",
            manufacturer: "Shure",
            inputChannels: 2,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )
        let configuration = ProductionAudioRecordingConfiguration(
            captureGroupID: UUID(),
            episodeSpaceID: "episode-5",
            participantID: "charlie",
            inputDevice: input,
            rootDirectory: URL(fileURLWithPath: "/tmp")
        )
        let receipt = ProductionAudioRecordingReceipt(
            recordingID: UUID(),
            configuration: configuration,
            state: .finalized,
            channelCount: 2,
            startedAt: Date(timeIntervalSince1970: 100),
            stoppedAt: Date(timeIntervalSince1970: 102),
            startedMonotonicNanoseconds: 1_000,
            stoppedMonotonicNanoseconds: 2_000,
            frameCount: 96_000,
            recordingDirectoryPath: "/tmp/take",
            audioPath: "/tmp/take/local-mic-master.wav",
            partialAudioPath: nil,
            byteCount: 576_044,
            sha256: String(repeating: "a", count: 64),
            failure: nil
        )

        XCTAssertTrue(receipt.truth.contains("virtual Core Audio route"))
        XCTAssertTrue(
            receipt.truth.contains("does not prove a direct physical MV7i")
        )
        XCTAssertFalse(receipt.truth.contains("finalized local microphone master"))
    }

    func testLocalMasterFileIsActually48k24BitPCM() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let url = directory.appendingPathComponent("format-proof.wav")
        var writer: AVAudioFile? = try AVAudioFile(
            forWriting: url,
            settings: ProductionAudioRecorder.localMasterFileSettings(
                channelCount: 1
            ),
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        )
        let bufferFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 48_000,
            channels: 1,
            interleaved: false
        )!
        let buffer = AVAudioPCMBuffer(
            pcmFormat: bufferFormat,
            frameCapacity: 4_800
        )!
        buffer.frameLength = 4_800
        try writer?.write(from: buffer)
        writer = nil

        let proof = try AVAudioFile(forReading: url)
        XCTAssertEqual(proof.fileFormat.sampleRate, 48_000, accuracy: 0.001)
        XCTAssertEqual(proof.fileFormat.channelCount, 1)
        XCTAssertEqual(
            proof.fileFormat.settings[AVLinearPCMBitDepthKey] as? Int,
            24
        )
        XCTAssertEqual(
            proof.fileFormat.settings[AVFormatIDKey] as? UInt32,
            kAudioFormatLinearPCM
        )
        XCTAssertGreaterThan(proof.length, 0)
    }
}
#endif
