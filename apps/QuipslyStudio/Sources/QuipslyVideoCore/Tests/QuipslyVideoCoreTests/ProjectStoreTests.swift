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

    func testProducerRenderManifestBecomesEditableBranchTruth() throws {
        let charliePath = "/media/Charlie.mov"
        let homerPath = "/media/Homer.mov"
        let audioPath = "/media/Charlie.wav"
        let originalActiveTag = VideoTag(type: .active, startTime: 0, duration: 60)
        let charlie = VideoLane(
            name: "Charlie camera",
            sourceVideo: SourceVideo(
                mediaURL: URL(fileURLWithPath: charliePath),
                proxyURL: URL(fileURLWithPath: "/proxy/charlie.mp4"),
                duration: 60,
                offset: 0
            ),
            tags: [originalActiveTag],
            metadata: VideoLaneMetadata(mediaKind: "video", role: "charlie_camera", sourcePath: charliePath, vaultProxyPath: "/proxy/charlie.mp4")
        )
        let homer = VideoLane(
            name: "Homer camera",
            sourceVideo: SourceVideo(
                mediaURL: URL(fileURLWithPath: homerPath),
                proxyURL: URL(fileURLWithPath: "/proxy/homer.mp4"),
                duration: 55,
                offset: 5
            ),
            tags: [originalActiveTag],
            metadata: VideoLaneMetadata(mediaKind: "video", role: "homer_camera", sourcePath: homerPath, vaultProxyPath: "/proxy/homer.mp4")
        )
        let audio = VideoLane(
            name: "Charlie editorial stem",
            sourceVideo: SourceVideo(mediaURL: URL(fileURLWithPath: audioPath), duration: 60),
            tags: [originalActiveTag],
            metadata: VideoLaneMetadata(mediaKind: "audio", role: "charlie_dialogue_treatment", sourcePath: audioPath)
        )
        let sequence = MediaSequence(
            title: "Episode 4 source baseline",
            lanes: [charlie, homer, audio],
            branchMetadata: EditBranchMetadata(branchName: "Source baseline"),
            audioSpineRegistryPath: "/registry/audio.json"
        )
        let store = ProjectStore(project: VideoProject(title: "Episode 4", sequences: [sequence]))
        let manifest = ProducerRenderManifest(
            branch: .init(id: "producer-v010", title: "Producer v010", target: "YouTube and podcast"),
            ranges: [.init(start: 10, end: 20, reason: "Strong opening")],
            chunks: [
                .init(sequenceStart: 10, sequenceEnd: 15, sourceId: "charlie", sourcePath: charliePath, renderPath: "/proxy/charlie.mp4", sourceStart: 10),
                .init(sequenceStart: 15, sequenceEnd: 20, sourceId: "homer", sourcePath: homerPath, renderPath: "/proxy/homer.mp4", sourceStart: 10)
            ],
            outputs: ["video16x9": .init(path: "/exports/episode4-v010.mp4")]
        )

        let result = try store.importProducerRenderManifest(
            manifest,
            manifestURL: URL(fileURLWithPath: "/exports/manifest.json")
        )
        let imported = try XCTUnwrap(store.activeSequence)

        XCTAssertEqual(result.keepRangeCount, 1)
        XCTAssertEqual(result.pictureDecisionCount, 2)
        XCTAssertEqual(imported.branchMetadata.renderVersion, "producer-v010")
        XCTAssertEqual(imported.branchMetadata.renderArtifactPaths, ["/exports/episode4-v010.mp4"])
        XCTAssertEqual(imported.audioSpineRegistryPath, "/registry/audio.json")
        XCTAssertEqual(imported.lanes[0].tags.filter { $0.type == .active }.count, 1)
        XCTAssertEqual(imported.lanes[1].tags.filter { $0.type == .active }.count, 1)
        XCTAssertEqual(imported.lanes[2].tags.filter { $0.type == .active }.count, 1)
        XCTAssertEqual(PlaybackEngine.computeValidRanges(for: imported), [10...20])
    }
}
