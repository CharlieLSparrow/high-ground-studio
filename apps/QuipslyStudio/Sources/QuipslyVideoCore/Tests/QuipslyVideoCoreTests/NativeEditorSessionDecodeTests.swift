import XCTest
import AVFoundation
@testable import QuipslyVideoCore

final class NativeEditorSessionDecodeTests: XCTestCase {
    func testProgramClipMotionRoundTripsWithoutChangingDecisionTiming() throws {
        let event = ProgramDecisionEvent(
            startTime: 42.5,
            kind: .bothWithClip,
            sourceLaneIDs: [UUID(), UUID()],
            clipLaneID: UUID(),
            clipMotion: .holdFrame,
            clipHoldSourceTime: 12.25
        )

        let data = try JSONEncoder().encode(event)
        let decoded = try JSONDecoder().decode(ProgramDecisionEvent.self, from: data)

        XCTAssertEqual(decoded.startTime, 42.5, accuracy: 0.000_1)
        XCTAssertEqual(decoded.resolvedClipMotion, .holdFrame)
        XCTAssertEqual(decoded.clipHoldSourceTime ?? -1, 12.25, accuracy: 0.000_1)
    }

    func testBranchKeepRangesConstrainInheritedProgramDecisions() {
        let lane = VideoLane(
            name: "Whole camera source",
            sourceVideo: SourceVideo(
                mediaURL: URL(fileURLWithPath: "/media/camera.mov"),
                duration: 100
            ),
            tags: [VideoTag(type: .active, startTime: 0, duration: 100)]
        )
        let sequence = MediaSequence(
            title: "Part 2",
            lanes: [lane],
            programDecisions: [
                ProgramDecisionEvent(startTime: 0, kind: .primary, sourceLaneIDs: [lane.id])
            ],
            branchMetadata: EditBranchMetadata(
                branchName: "Part 2",
                programKeepRanges: [
                    EditBranchProgramRange(startTime: 10, endTime: 20),
                    EditBranchProgramRange(startTime: 60, endTime: 80)
                ]
            )
        )

        XCTAssertEqual(PlaybackEngine.computeValidRanges(for: sequence), [10...20, 60...80])
        XCTAssertEqual(PlaybackEngine.computeProgramDuration(for: sequence), 30, accuracy: 0.000_1)
    }

    func testExplicitProgramSkipsInsideBranchKeepRangesReduceProgramDuration() {
        let lane = VideoLane(
            name: "Whole camera source",
            sourceVideo: SourceVideo(
                mediaURL: URL(fileURLWithPath: "/media/camera.mov"),
                duration: 100
            ),
            tags: [VideoTag(type: .active, startTime: 0, duration: 100)]
        )
        let sequence = MediaSequence(
            title: "Branch with internal skips",
            lanes: [lane],
            programDecisions: [
                ProgramDecisionEvent(startTime: 0, kind: .primary, sourceLaneIDs: [lane.id]),
                ProgramDecisionEvent(startTime: 20, kind: .skip),
                ProgramDecisionEvent(startTime: 30, kind: .primary, sourceLaneIDs: [lane.id]),
                ProgramDecisionEvent(startTime: 60, kind: .skip),
                ProgramDecisionEvent(startTime: 80, kind: .primary, sourceLaneIDs: [lane.id])
            ],
            branchMetadata: EditBranchMetadata(
                branchName: "Internal skip proof",
                programKeepRanges: [
                    EditBranchProgramRange(startTime: 10, endTime: 40),
                    EditBranchProgramRange(startTime: 50, endTime: 90)
                ]
            )
        )

        XCTAssertEqual(
            PlaybackEngine.computeValidRanges(for: sequence),
            [10...20, 30...40, 50...60, 80...90]
        )
        XCTAssertEqual(PlaybackEngine.computeProgramDuration(for: sequence), 40, accuracy: 0.000_1)
    }

    @MainActor
    func testCollapsedProgramBoundaryAdvancesIntoNextKeptRange() {
        let engine = PlaybackEngine()
        engine.playbackMode = .playEdit
        engine.validRanges = [10...20, 60...80]

        XCTAssertEqual(engine.programTime(from: 20), 10, accuracy: 0.000_1)
        XCTAssertEqual(engine.programTime(from: 60), 10, accuracy: 0.000_1)
        XCTAssertEqual(engine.sequenceTime(from: 10), 60, accuracy: 0.000_1)
        XCTAssertEqual(engine.sequenceTime(from: 30), 80, accuracy: 0.000_1)
    }

    func testSessionProvidedByEnvironmentDecodesWithProductionModel() throws {
        guard let path = ProcessInfo.processInfo.environment["QUIPSLY_SESSION_UNDER_TEST"],
              !path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw XCTSkip("Set QUIPSLY_SESSION_UNDER_TEST to validate a generated Studio session.")
        }

        let url = URL(fileURLWithPath: path)
        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        do {
            let session = try decoder.decode(NativeEditorSession.self, from: data)
            let sequence = session.project.sequences.first { $0.id == session.activeSequenceId }
            XCTAssertNotNil(sequence, "The session activeSequenceId must resolve to a sequence.")
            XCTAssertFalse(sequence?.lanes.isEmpty ?? true, "The active sequence must contain source lanes.")
        } catch {
            XCTFail("Production NativeEditorSession decode failed for \(path): \(Self.describe(error))")
        }
    }

    func testRealSessionExportContract() async throws {
        guard let path = ProcessInfo.processInfo.environment["QUIPSLY_SESSION_UNDER_TEST"],
              !path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw XCTSkip("Set QUIPSLY_SESSION_UNDER_TEST to validate a real Studio export graph.")
        }

        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let session = try decoder.decode(NativeEditorSession.self, from: data)
        let sequence = try XCTUnwrap(session.project.sequences.first { $0.id == session.activeSequenceId })
        guard let allowedMediaRootPath = ProcessInfo.processInfo.environment["QUIPSLY_ALLOWED_MEDIA_ROOT"],
              !allowedMediaRootPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw XCTSkip("Set QUIPSLY_ALLOWED_MEDIA_ROOT to the explicitly granted Quipsly Media Vault root.")
        }

        let playerItem = try await AVCompositionBuilder().buildPlayerItem(
            for: sequence,
            mode: .playEdit,
            format: .horizontal16x9,
            allowExternalOriginalMedia: false,
            allowedOriginalMediaRootPath: allowedMediaRootPath,
            allowedProxyMediaRootPath: allowedMediaRootPath
        )
        let composition = try XCTUnwrap(playerItem.asset as? AVComposition)
        let assetDuration = CMTimeGetSeconds(composition.duration)
        XCTAssertTrue(assetDuration.isFinite && assetDuration > 0, "The collapsed program needs a positive duration.")

        if let videoComposition = playerItem.videoComposition,
           let instructionEnd = videoComposition.instructions.map({ CMTimeGetSeconds($0.timeRange.end) }).max() {
            XCTAssertLessThanOrEqual(
                instructionEnd,
                assetDuration + 0.05,
                "Video instructions must not extend beyond the composition asset."
            )
        }

        let preset = AVAssetExportPreset1920x1080
        let compatiblePresets = AVAssetExportSession.exportPresets(compatibleWith: composition)
        XCTAssertTrue(compatiblePresets.contains(preset), "1920x1080 is not compatible with this composition: \(compatiblePresets)")
        let mp4Compatible = await AVAssetExportSession.compatibility(
            ofExportPreset: preset,
            with: composition,
            outputFileType: .mp4
        )
        XCTAssertTrue(mp4Compatible, "AVFoundation rejects the 1920x1080 + MP4 export contract.")

        guard let diagnosticDirectory = ProcessInfo.processInfo.environment["QUIPSLY_EXPORT_DIAGNOSTIC_DIR"],
              !diagnosticDirectory.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }

        let outputDirectory = URL(fileURLWithPath: diagnosticDirectory, isDirectory: true)
        try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

        try await exportDiagnosticStage(
            named: "composition-only",
            asset: composition,
            videoComposition: nil,
            includeAudioMix: false,
            outputDirectory: outputDirectory
        )
        try await exportDiagnosticStage(
            named: "video-composition",
            asset: composition,
            videoComposition: playerItem.videoComposition,
            includeAudioMix: false,
            outputDirectory: outputDirectory
        )
        try await exportDiagnosticStage(
            named: "full-mix",
            asset: composition,
            videoComposition: playerItem.videoComposition,
            includeAudioMix: true,
            outputDirectory: outputDirectory
        )
    }

    private func exportDiagnosticStage(
        named name: String,
        asset: AVComposition,
        videoComposition: AVVideoComposition?,
        includeAudioMix: Bool,
        outputDirectory: URL
    ) async throws {
        let outputURL = outputDirectory.appendingPathComponent("\(name).mp4")
        try? FileManager.default.removeItem(at: outputURL)

        let exportSession = try XCTUnwrap(
            AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1920x1080),
            "Could not create the \(name) export session."
        )
        XCTAssertTrue(exportSession.supportedFileTypes.contains(.mp4), "\(name) does not support MP4 output.")
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.videoComposition = videoComposition
        exportSession.shouldOptimizeForNetworkUse = true
        exportSession.timeRange = CMTimeRange(
            start: .zero,
            duration: CMTime(seconds: min(2, CMTimeGetSeconds(asset.duration)), preferredTimescale: 600)
        )

        if includeAudioMix {
            let mix = AVMutableAudioMix()
            mix.inputParameters = asset.tracks(withMediaType: .audio).map { track in
                let parameters = AVMutableAudioMixInputParameters(track: track)
                parameters.setVolume(1, at: .zero)
                return parameters
            }
            exportSession.audioMix = mix
        }

        await exportSession.export()
        if exportSession.status != .completed {
            let detail = exportSession.error.map(Self.describe) ?? "unknown error"
            XCTFail("Export diagnostic stage \(name) failed: \(detail)")
            throw exportSession.error ?? ExportError.exportFailed(nil)
        }
    }

    private static func describe(_ error: Error) -> String {
        func path(_ codingPath: [CodingKey]) -> String {
            let value = codingPath.map { key in
                key.intValue.map { "[\($0)]" } ?? key.stringValue
            }
            .joined(separator: ".")
            return value.isEmpty ? "<root>" : value
        }

        switch error {
        case DecodingError.keyNotFound(let key, let context):
            return "missing key \(key.stringValue) at \(path(context.codingPath)): \(context.debugDescription)"
        case DecodingError.valueNotFound(_, let context):
            return "missing value at \(path(context.codingPath)): \(context.debugDescription)"
        case DecodingError.typeMismatch(_, let context):
            return "type mismatch at \(path(context.codingPath)): \(context.debugDescription)"
        case DecodingError.dataCorrupted(let context):
            return "corrupt value at \(path(context.codingPath)): \(context.debugDescription)"
        default:
            return error.localizedDescription
        }
    }
}
