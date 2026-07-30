import XCTest
@testable import QuipslyVideoCore

final class ProjectStoreTests: XCTestCase {

    func testUndoRedoProjectUpdate() {
        let initialProject = VideoProject(title: "Initial", sequences: [])
        let store = ProjectStore(project: initialProject)
        let undoManager = UndoManager()

        let newProject = VideoProject(title: "Updated", sequences: [])
        store.updateProject(newProject, undoManager: undoManager, actionName: "Update Title")

        XCTAssertEqual(store.project.title, "Updated")
        XCTAssertTrue(undoManager.canUndo)

        undoManager.undo()
        XCTAssertEqual(store.project.title, "Initial")
        XCTAssertTrue(undoManager.canRedo)

        undoManager.redo()
        XCTAssertEqual(store.project.title, "Updated")
    }

    func testMediaBinAddition() {
        let initialProject = VideoProject(title: "Project", sequences: [])
        let store = ProjectStore(project: initialProject)
        let undoManager = UndoManager()

        var newProject = store.project
        let newItem = MediaItem(url: URL(fileURLWithPath: "/test.mp4"), name: "test.mp4")
        newProject.mediaBin.append(newItem)

        store.updateProject(newProject, undoManager: undoManager, actionName: "Add Media")

        XCTAssertEqual(store.project.mediaBin.count, 1)
        XCTAssertEqual(store.project.mediaBin.first?.name, "test.mp4")

        undoManager.undo()
        XCTAssertEqual(store.project.mediaBin.count, 0)
    }

    #if os(macOS)
    func testVerifiedCaptureAttachmentCreatesLaneMetadataAndReceipt() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let sourceReceiptPath = directory
            .appendingPathComponent("camera-card-import-receipt.json")
            .path
        let mediaURL = directory.appendingPathComponent("managed.mp4")
        let captureGroupID = UUID()
        let store = ProjectStore(
            project: VideoProject(title: "New Project")
        )

        let receipt = try store.attachVerifiedCaptureSource(
            VerifiedCaptureSourceAttachment(
                sourceAssetID: "camera-import-1",
                captureGroupID: captureGroupID,
                episodeSpaceID: "hgo-episode-5",
                mediaURL: mediaURL,
                originalURL: URL(fileURLWithPath: "/Volumes/CANON/DCIM/managed.mp4"),
                duration: 90,
                name: "Charlie Canon card",
                role: "charlie_camera",
                ingestKind: "canon_card_verified_managed_original",
                sha256: String(repeating: "a", count: 64),
                sourceReceiptPath: sourceReceiptPath
            )
        )

        XCTAssertEqual(store.project.title, "hgo-episode-5")
        XCTAssertEqual(store.project.mediaBin.map(\.url), [mediaURL])
        XCTAssertEqual(store.project.sequences.count, 1)
        XCTAssertEqual(store.activeSequenceId, receipt.sequenceID)
        let lane = try XCTUnwrap(store.activeSequence?.lanes.first)
        XCTAssertEqual(lane.id, receipt.laneID)
        XCTAssertEqual(lane.sourceVideo?.mediaURL, mediaURL)
        XCTAssertEqual(lane.sourceVideo?.duration, 90)
        XCTAssertEqual(lane.metadata?.sourceAssetId, "camera-import-1")
        XCTAssertEqual(
            lane.metadata?.captureGroupID,
            captureGroupID.uuidString.lowercased()
        )
        XCTAssertEqual(
            lane.metadata?.ingestKind,
            "canon_card_verified_managed_original"
        )
        XCTAssertEqual(lane.metadata?.alignmentStatus, "needs-alignment")
        XCTAssertEqual(lane.metadata?.sourceReceiptPath, sourceReceiptPath)
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: directory
                    .appendingPathComponent(
                        LocalEditorSourceAttachmentWriter.filename
                    )
                    .path
            )
        )
        XCTAssertTrue(receipt.truth.contains("non-destructive editor lane"))
        XCTAssertTrue(receipt.truth.contains("does not prove cloud upload"))
    }

    func testCaptureClockAttachmentPersistsTimelinePlacement() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let sourceReceiptPath = directory
            .appendingPathComponent("camera-reference-receipt.json")
            .path
        let store = ProjectStore(
            project: VideoProject(title: "New Project")
        )

        let receipt = try store.attachVerifiedCaptureSource(
            VerifiedCaptureSourceAttachment(
                sourceAssetID: "camera-reference-1",
                captureGroupID: UUID(),
                episodeSpaceID: "hgo-episode-5",
                mediaURL: directory
                    .appendingPathComponent("reference.mov"),
                originalURL: directory
                    .appendingPathComponent("reference.mov"),
                duration: 30,
                name: "Charlie camera reference",
                role: "charlie_camera_reference",
                ingestKind: "mac_local_video_reference",
                sha256: String(repeating: "b", count: 64),
                sourceReceiptPath: sourceReceiptPath,
                timelineOffsetSeconds: 0.237,
                alignmentStatus: "capture-clock-proposed"
            )
        )

        let lane = try XCTUnwrap(store.activeSequence?.lanes.first)
        XCTAssertEqual(
            lane.sourceVideo?.offset ?? -1,
            0.237,
            accuracy: 0.000_001
        )
        XCTAssertEqual(
            lane.metadata?.alignmentStatus,
            "capture-clock-proposed"
        )
        XCTAssertEqual(
            receipt.timelineOffsetSeconds ?? -1,
            0.237,
            accuracy: 0.000_001
        )
        XCTAssertTrue(receipt.truth.contains("monotonic clock"))
        XCTAssertTrue(receipt.truth.contains("does not prove reviewed alignment"))
    }

    func testCaptureWorkingSessionPersistsAndReloadsExactSourcePair()
        async throws
    {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                UUID().uuidString,
                isDirectory: true
            )
        defer {
            try? FileManager.default.removeItem(
                at: directory
            )
        }
        let audioDirectory = directory
            .appendingPathComponent(
                "audio",
                isDirectory: true
            )
        let videoDirectory = directory
            .appendingPathComponent(
                "video",
                isDirectory: true
            )
        try FileManager.default.createDirectory(
            at: audioDirectory,
            withIntermediateDirectories: true
        )
        try FileManager.default.createDirectory(
            at: videoDirectory,
            withIntermediateDirectories: true
        )

        let captureGroupID = UUID()
        let store = ProjectStore(
            project: VideoProject(title: "New Project")
        )
        _ = try store.attachVerifiedCaptureSource(
            VerifiedCaptureSourceAttachment(
                sourceAssetID: "audio-1",
                captureGroupID: captureGroupID,
                episodeSpaceID: "HGO Mac A/V",
                mediaURL: audioDirectory
                    .appendingPathComponent("master.wav"),
                originalURL: audioDirectory
                    .appendingPathComponent("master.wav"),
                duration: 14,
                name: "Charlie microphone",
                role: "charlie_microphone_master",
                ingestKind: "mac_local_audio_master",
                sha256: String(repeating: "a", count: 64),
                sourceReceiptPath: audioDirectory
                    .appendingPathComponent(
                        "production-audio-receipt.json"
                    )
                    .path,
                timelineOffsetSeconds: 0.073,
                alignmentStatus: "capture-clock-proposed"
            )
        )
        _ = try store.attachVerifiedCaptureSource(
            VerifiedCaptureSourceAttachment(
                sourceAssetID: "video-1",
                captureGroupID: captureGroupID,
                episodeSpaceID: "HGO Mac A/V",
                mediaURL: videoDirectory
                    .appendingPathComponent("reference.mov"),
                originalURL: videoDirectory
                    .appendingPathComponent("reference.mov"),
                duration: 14.2,
                name: "Charlie camera",
                role: "charlie_camera_reference",
                ingestKind: "mac_local_video_reference",
                sha256: String(repeating: "b", count: 64),
                sourceReceiptPath: videoDirectory
                    .appendingPathComponent(
                        "production-video-reference-receipt.json"
                    )
                    .path,
                alignmentStatus: "capture-clock-proposed"
            )
        )

        let session = NativeEditorSession(
            activeSequenceId: store.activeSequenceId,
            project: store.project
        )
        let vault = LocalMediaVault(
            rootURL: directory
                .appendingPathComponent(
                    "vault",
                    isDirectory: true
                )
        )
        let receipt =
            try await CaptureEditorWorkingSession
            .persistAndVerify(
                session: session,
                episodeSpaceID: "HGO Mac A/V",
                captureGroupID: captureGroupID,
                vault: vault
            )

        XCTAssertTrue(
            NativeSessionNamePolicy
                .isMutableWorkingSession(receipt.name)
        )
        XCTAssertEqual(
            receipt.captureLaneIDs.count,
            2
        )
        XCTAssertEqual(
            Set(receipt.captureLaneIDs),
            Set(store.activeSequence?.lanes.map(\.id) ?? [])
        )
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: receipt.url.path
            )
        )
        let reloaded = try await vault.loadSession(
            named: receipt.name
        )
        XCTAssertEqual(
            reloaded.activeSequenceId,
            session.activeSequenceId
        )
        XCTAssertEqual(
            reloaded.project.id,
            session.project.id
        )
        XCTAssertEqual(
            reloaded.project.mediaBin,
            session.project.mediaBin
        )
        let reloadedSequence = try XCTUnwrap(
            reloaded.project.sequences.first(where: {
                $0.id == session.activeSequenceId
            })
        )
        let originalSequence = try XCTUnwrap(
            store.activeSequence
        )
        XCTAssertEqual(
            reloadedSequence.lanes.map(\.id),
            originalSequence.lanes.map(\.id)
        )
        XCTAssertEqual(
            reloadedSequence.lanes.map(\.sourceVideo),
            originalSequence.lanes.map(\.sourceVideo)
        )
        XCTAssertEqual(
            reloadedSequence.lanes.map(\.metadata),
            originalSequence.lanes.map(\.metadata)
        )
        XCTAssertTrue(
            receipt.truth.contains(
                "durable local editor recovery"
            )
        )
        XCTAssertTrue(
            receipt.truth.contains(
                "not reviewed synchronization"
            )
        )
    }

    func testCaptureWorkingSessionNameFitsFilesystemComponentLimit() {
        let name = CaptureEditorWorkingSession.name(
            episodeSpaceID:
                String(repeating: "épisode-long-", count: 80),
            captureGroupID: UUID()
        )

        XCTAssertTrue(
            NativeSessionNamePolicy
                .isMutableWorkingSession(name)
        )
        XCTAssertLessThanOrEqual(
            "\(name).quipsly-session.json".utf8.count,
            255
        )
    }

    func testCanonicalTranscriptImportPreservesExternalWordIdentityAndRefusesSilentReplacement() throws {
        let store = ProjectStore(
            project: VideoProject(
                title: "Episode",
                sequences: [MediaSequence(title: "Main")]
            )
        )
        let segment = TranscriptSegment(
            sourceExternalID: "segment-server-1",
            sourceTranscriptJobID: "transcript-job-1",
            speaker: "Charlie",
            startTime: 1.2,
            endTime: 2.4,
            text: "This is reviewed.",
            providerText: "This is reviewd.",
            words: [
                TranscriptWordTiming(
                    sourceExternalID: "word-server-1",
                    providerWordIndex: 0,
                    word: "This",
                    startTime: 1.2,
                    endTime: 1.5,
                    confidence: 0.99,
                    source: "deepgram-word-anchor"
                ),
            ],
            reviewStatus: "human-reviewed"
        )

        XCTAssertFalse(
            try store.applyCanonicalTranscriptHandoff(
                transcriptJobID: "transcript-job-1",
                provider: "deepgram",
                sourcePath: "https://nest.example/handoff",
                segments: [segment]
            )
        )
        XCTAssertEqual(
            store.activeSequence?.transcriptSegments.first?
                .sourceExternalID,
            "segment-server-1"
        )
        XCTAssertEqual(
            store.activeSequence?.transcriptSegments.first?
                .words.first?.providerWordIndex,
            0
        )
        XCTAssertEqual(
            store.activeSequence?.transcriptJobs.first?
                .sourceExternalID,
            "transcript-job-1"
        )
        XCTAssertTrue(
            try store.applyCanonicalTranscriptHandoff(
                transcriptJobID: "transcript-job-1",
                provider: "deepgram",
                sourcePath: "https://nest.example/handoff",
                segments: [segment]
            )
        )

        XCTAssertThrowsError(
            try store.applyCanonicalTranscriptHandoff(
                transcriptJobID: "transcript-job-2",
                provider: "deepgram",
                sourcePath: "https://nest.example/other",
                segments: [
                    TranscriptSegment(
                        sourceExternalID: "segment-server-2",
                        sourceTranscriptJobID:
                            "transcript-job-2",
                        startTime: 3,
                        endTime: 4,
                        text: "Different version"
                    ),
                ]
            )
        )
        XCTAssertEqual(
            store.activeSequence?.transcriptSegments.first?
                .sourceTranscriptJobID,
            "transcript-job-1"
        )

        XCTAssertThrowsError(
            try store.applyCanonicalTranscriptHandoff(
                transcriptJobID: "transcript-job-3",
                provider: "deepgram",
                sourcePath: "https://nest.example/invalid",
                segments: [
                    TranscriptSegment(
                        sourceExternalID: "segment-server-3",
                        sourceTranscriptJobID:
                            "transcript-job-3",
                        startTime: 0,
                        endTime: 1,
                        text: "Broken anchors",
                        words: [
                            TranscriptWordTiming(
                                sourceExternalID:
                                    "word-server-3",
                                providerWordIndex: 7,
                                word: "Broken",
                                startTime: 0,
                                endTime: 0.4
                            ),
                        ]
                    ),
                ]
            )
        ) { error in
            XCTAssertEqual(
                error as? CanonicalTranscriptImportError,
                .invalidHandoff
            )
        }
    }

    func testAttachmentEvidenceFailsClosedOnInvalidAlignmentClaims() {
        let source = VerifiedCaptureSourceAttachment(
            sourceAssetID: "source-1",
            captureGroupID: UUID(),
            episodeSpaceID: "hgo-episode-5",
            mediaURL: URL(fileURLWithPath: "/tmp/source.mov"),
            originalURL: URL(fileURLWithPath: "/tmp/source.mov"),
            duration: 10,
            name: "Unreviewed source",
            role: "camera_reference",
            ingestKind: "mac_local_video_reference",
            sha256: nil,
            sourceReceiptPath: "/tmp/source-receipt.json",
            timelineOffsetSeconds: .infinity,
            alignmentStatus: "sample-accurate"
        )

        XCTAssertEqual(source.timelineOffsetSeconds, 0)
        XCTAssertEqual(source.alignmentStatus, "needs-alignment")

        let historicalSource = VerifiedCaptureSourceAttachment(
            sourceAssetID: "historical-source",
            captureGroupID: UUID(),
            episodeSpaceID: "hgo-episode-5",
            mediaURL: URL(fileURLWithPath: "/tmp/historical.mov"),
            originalURL: URL(fileURLWithPath: "/tmp/historical.mov"),
            duration: 10,
            name: "Historical clock source",
            role: "camera_reference",
            ingestKind: "mac_local_video_reference",
            sha256: nil,
            sourceReceiptPath: "/tmp/historical-receipt.json",
            timelineOffsetSeconds: 0.5,
            alignmentStatus: "capture-clock-aligned"
        )
        XCTAssertEqual(
            historicalSource.alignmentStatus,
            "capture-clock-proposed"
        )

        let receipt = LocalEditorSourceAttachmentReceipt(
            sourceAssetID: source.sourceAssetID,
            captureGroupID: source.captureGroupID,
            episodeSpaceID: source.episodeSpaceID,
            projectID: UUID(),
            sequenceID: UUID(),
            laneID: UUID(),
            mediaPath: source.mediaURL.path,
            sourceReceiptPath: source.sourceReceiptPath,
            alignmentStatus: "sample-accurate",
            timelineOffsetSeconds: .nan
        )

        XCTAssertEqual(receipt.alignmentStatus, "needs-alignment")
        XCTAssertNil(receipt.timelineOffsetSeconds)
        XCTAssertTrue(receipt.truth.contains("does not prove cloud upload"))
    }
    #endif
}
