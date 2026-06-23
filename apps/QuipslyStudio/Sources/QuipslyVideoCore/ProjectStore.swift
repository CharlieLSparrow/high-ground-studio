import Foundation
import Combine

public class ProjectStore: ObservableObject {
    public let objectWillChange = ObservableObjectPublisher()
    public var project: VideoProject
    public var activeSequenceId: UUID?

    public init(project: VideoProject) {
        self.project = project
        self.activeSequenceId = project.sequences.first?.id
    }

    /// Returns the active sequence
    public var activeSequence: MediaSequence? {
        guard let id = activeSequenceId else { return nil }
        return project.sequences.first { $0.id == id }
    }

    /// Updates the project state and registers the inverse operation with the undo manager
    public func updateProject(_ newProject: VideoProject, undoManager: UndoManager?, actionName: String) {
        let oldProject = project
        let oldSequenceId = activeSequenceId

        undoManager?.registerUndo(withTarget: self) { store in
            store.replaceProject(oldProject, activeSequenceId: oldSequenceId, publish: true)
        }

        undoManager?.setActionName(actionName)

        self.project = newProject
        objectWillChange.send()
    }

    /// Helper to update a single sequence and automatically re-compose the project
    public func updateSequence(_ newSequence: MediaSequence, undoManager: UndoManager?, actionName: String) {
        var modifiedProject = project
        if let index = modifiedProject.sequences.firstIndex(where: { $0.id == newSequence.id }) {
            modifiedProject.sequences[index] = newSequence
            updateProject(modifiedProject, undoManager: undoManager, actionName: actionName)
        }
    }

    public func saveNativeSession(named name: String) async throws -> URL {
        let session = NativeEditorSession(activeSequenceId: activeSequenceId, project: project)
        return try await LocalMediaVault.shared.saveSession(session, named: name)
    }

    public func readNativeSession(named name: String) async throws -> (session: NativeEditorSession, url: URL) {
        let session = try await LocalMediaVault.shared.loadSession(named: name)
        return (session, LocalMediaVault.shared.sessionURL(named: name))
    }

    public func applyNativeSession(_ session: NativeEditorSession, publish: Bool = true) {
        replaceProject(
            session.project,
            activeSequenceId: session.activeSequenceId ?? session.project.sequences.first?.id,
            publish: publish
        )
    }

    public func replaceProject(_ newProject: VideoProject, activeSequenceId newActiveSequenceId: UUID? = nil, publish: Bool = true) {
        activeSequenceId = newActiveSequenceId ?? activeSequenceId ?? newProject.sequences.first?.id
        project = newProject
        if publish {
            objectWillChange.send()
        }
    }

    public func publishChanges() {
        objectWillChange.send()
    }

    public func loadNativeSession(named name: String) async throws -> URL {
        let loaded = try await readNativeSession(named: name)
        applyNativeSession(loaded.session)
        return loaded.url
    }
}
