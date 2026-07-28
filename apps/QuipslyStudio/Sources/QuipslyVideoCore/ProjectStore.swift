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
        applyProject(
            newProject,
            activeSequenceId: activeSequenceId,
            undoManager: undoManager,
            actionName: actionName
        )
    }

    /// Applies one project snapshot and registers its inverse. Calling the same
    /// method from the undo closure lets UndoManager build a real redo stack.
    private func applyProject(
        _ newProject: VideoProject,
        activeSequenceId newActiveSequenceId: UUID?,
        undoManager: UndoManager?,
        actionName: String
    ) {
        let previousProject = project
        let previousSequenceId = activeSequenceId

        undoManager?.registerUndo(withTarget: self) { [weak undoManager] store in
            store.applyProject(
                previousProject,
                activeSequenceId: previousSequenceId,
                undoManager: undoManager,
                actionName: actionName
            )
        }
        undoManager?.setActionName(actionName)

        project = newProject
        activeSequenceId = newActiveSequenceId ?? newProject.sequences.first?.id
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

    @discardableResult
    public func duplicateActiveSequenceAsBranch(
        name: String,
        role: String = "experiment",
        purpose: String = "",
        createdBy: String = "Quipsly Studio",
        undoManager: UndoManager?,
        actionName: String = "Create Edit Branch"
    ) -> UUID? {
        guard let sourceSequence = activeSequence else { return nil }

        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let branchTitle = cleanName.isEmpty ? "\(sourceSequence.title) Branch" : cleanName
        let now = Date()
        let sourceBaselineId = sourceSequence.branchMetadata.sourceBaselineSequenceId ?? sourceSequence.id
        let branchMetadata = EditBranchMetadata(
            branchName: branchTitle,
            branchRole: role,
            parentSequenceId: sourceSequence.id,
            sourceBaselineSequenceId: sourceBaselineId,
            branchStatus: "active",
            branchPurpose: purpose,
            createdBy: createdBy,
            createdAt: now,
            updatedAt: now,
            programKeepRanges: sourceSequence.branchMetadata.programKeepRanges
        )

        let branchSequence = MediaSequence(
            title: branchTitle,
            orientationTrack: sourceSequence.orientationTrack,
            verticalOrientationTrack: sourceSequence.verticalOrientationTrack,
            lanes: sourceSequence.lanes,
            programDecisions: sourceSequence.programDecisions,
            shortClipQueue: sourceSequence.shortClipQueue,
            transcriptSegments: sourceSequence.transcriptSegments,
            transcriptJobs: sourceSequence.transcriptJobs,
            editCorrectionNotes: sourceSequence.editCorrectionNotes,
            editActionLedger: sourceSequence.editActionLedger,
            publishReceipts: [],
            editPassContext: sourceSequence.editPassContext,
            branchMetadata: branchMetadata,
            audioSpineRegistryPath: sourceSequence.audioSpineRegistryPath,
            audioSpineCandidates: sourceSequence.audioSpineCandidates,
            selectedAudioSpineCandidateID: sourceSequence.selectedAudioSpineCandidateID,
            audioSpineBranchRenderingLocked: sourceSequence.audioSpineBranchRenderingLocked
        )

        var modifiedProject = project
        modifiedProject.sequences.append(branchSequence)
        updateProject(modifiedProject, undoManager: undoManager, actionName: actionName)
        activeSequenceId = branchSequence.id
        objectWillChange.send()
        return branchSequence.id
    }

    public func saveNativeSession(
        named name: String,
        intent: NativeSessionSaveIntent = .explicitCheckpoint
    ) async throws -> URL {
        let session = NativeEditorSession(activeSequenceId: activeSequenceId, project: project)
        return try await LocalMediaVault.shared.saveSession(
            session,
            named: name,
            intent: intent
        )
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

    @discardableResult
    public func selectSequence(id: UUID, publish: Bool = true) -> Bool {
        guard project.sequences.contains(where: { $0.id == id }) else {
            return false
        }
        activeSequenceId = id
        if publish {
            objectWillChange.send()
        }
        return true
    }

    public func publishChanges() {
        objectWillChange.send()
    }

    @discardableResult
    public func attachVerifiedCaptureSource(
        _ source: VerifiedCaptureSourceAttachment
    ) throws -> LocalEditorSourceAttachmentReceipt {
        var nextProject = project
        if nextProject.title == "New Project" {
            nextProject.title = source.episodeSpaceID
        }
        if !nextProject.mediaBin.contains(where: {
            $0.url == source.mediaURL
        }) {
            nextProject.mediaBin.append(
                MediaItem(
                    url: source.mediaURL,
                    name: source.mediaURL.lastPathComponent
                )
            )
        }

        let sequenceIndex: Int
        if let activeSequenceId,
           let activeIndex = nextProject.sequences.firstIndex(where: {
               $0.id == activeSequenceId
           }) {
            sequenceIndex = activeIndex
        } else if !nextProject.sequences.isEmpty {
            sequenceIndex = 0
        } else {
            nextProject.sequences.append(
                MediaSequence(
                    title: "\(source.episodeSpaceID) source timeline"
                )
            )
            sequenceIndex = nextProject.sequences.count - 1
        }

        let laneID = UUID()
        let sequenceID = nextProject.sequences[sequenceIndex].id
        let media = SourceVideo(
            mediaURL: source.mediaURL,
            duration: source.duration,
            offset: source.timelineOffsetSeconds
        )
        let metadata = VideoLaneMetadata(
            sourceAssetId: source.sourceAssetID,
            mediaKind: source.mediaURL.pathExtension.lowercased() == "wav"
                ? "audio"
                : "video",
            role: source.role,
            sourcePath: source.mediaURL.path,
            originalPath: source.originalURL.path,
            vaultRawPath: source.mediaURL.path,
            assetFingerprint: source.sha256,
            sourceReceiptPath: source.sourceReceiptPath,
            captureGroupID: source.captureGroupID.uuidString.lowercased(),
            episodeSpaceID: source.episodeSpaceID,
            ingestKind: source.ingestKind,
            alignmentStatus: source.alignmentStatus,
            declaredExists: true,
            sourceLabel: source.name
        )
        nextProject.sequences[sequenceIndex].lanes.append(
            VideoLane(
                id: laneID,
                name: source.name,
                sourceVideo: media,
                metadata: metadata
            )
        )
        replaceProject(
            nextProject,
            activeSequenceId: sequenceID
        )

        let receipt = LocalEditorSourceAttachmentReceipt(
            sourceAssetID: source.sourceAssetID,
            captureGroupID: source.captureGroupID,
            episodeSpaceID: source.episodeSpaceID,
            projectID: nextProject.id,
            sequenceID: sequenceID,
            laneID: laneID,
            mediaPath: source.mediaURL.path,
            sourceReceiptPath: source.sourceReceiptPath,
            alignmentStatus: source.alignmentStatus,
            timelineOffsetSeconds: source.timelineOffsetSeconds
        )
        try LocalEditorSourceAttachmentWriter.write(
            receipt,
            besideSourceReceipt: source.sourceReceiptPath
        )
        return receipt
    }

    public func loadNativeSession(named name: String) async throws -> URL {
        let loaded = try await readNativeSession(named: name)
        applyNativeSession(loaded.session)
        return loaded.url
    }
}
