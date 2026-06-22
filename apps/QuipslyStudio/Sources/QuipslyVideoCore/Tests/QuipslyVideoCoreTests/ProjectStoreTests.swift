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
}
