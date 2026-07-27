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
                alignmentStatus: "capture-clock-aligned"
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
            "capture-clock-aligned"
        )
        XCTAssertEqual(
            receipt.timelineOffsetSeconds ?? -1,
            0.237,
            accuracy: 0.000_001
        )
        XCTAssertTrue(receipt.truth.contains("monotonic clock"))
        XCTAssertTrue(receipt.truth.contains("does not prove content-level lip sync"))
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
