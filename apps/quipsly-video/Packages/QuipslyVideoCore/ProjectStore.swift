import Foundation
import Combine

public class ProjectStore: ObservableObject {
    @Published public var project: VideoProject
    @Published public var activeSequenceId: UUID?
    
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
            store.updateProject(oldProject, undoManager: undoManager, actionName: actionName)
            store.activeSequenceId = oldSequenceId
        }
        
        undoManager?.setActionName(actionName)
        
        self.project = newProject
    }
    
    /// Helper to update a single sequence and automatically re-compose the project
    public func updateSequence(_ newSequence: MediaSequence, undoManager: UndoManager?, actionName: String) {
        var modifiedProject = project
        if let index = modifiedProject.sequences.firstIndex(where: { $0.id == newSequence.id }) {
            modifiedProject.sequences[index] = newSequence
            updateProject(modifiedProject, undoManager: undoManager, actionName: actionName)
        }
    }
}
