import Foundation
import Combine

public enum CanonicalTranscriptImportError:
    Error,
    Equatable,
    LocalizedError
{
    case noActiveSequence
    case emptyHandoff
    case invalidHandoff
    case existingTranscriptHasDifferentIdentity

    public var errorDescription: String? {
        switch self {
        case .noActiveSequence:
            return "Open an editor sequence before importing the canonical transcript."
        case .emptyHandoff:
            return "The canonical transcript handoff contains no timed segments."
        case .invalidHandoff:
            return "The canonical transcript handoff has incomplete or inconsistent external identities and timing."
        case .existingTranscriptHasDifferentIdentity:
            return "This sequence already has a different transcript spine. Create or choose a branch before replacing it."
        }
    }
}

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

    /// Installs one Nest-owned transcript spine without discarding another
    /// transcript version. Re-importing the same canonical job is idempotent;
    /// importing a different job requires an explicit branch or clear action.
    private func canonicalTranscriptWordSemanticsMatch(
        _ left: TranscriptWordTiming,
        _ right: TranscriptWordTiming
    ) -> Bool {
        left.sourceExternalID == right.sourceExternalID
            && left.providerWordIndex == right.providerWordIndex
            && left.word == right.word
            && left.rawWord == right.rawWord
            && left.startTime == right.startTime
            && left.endTime == right.endTime
            && left.confidence == right.confidence
            && left.speaker == right.speaker
            && left.channel == right.channel
            && left.source == right.source
    }

    private func canonicalTranscriptSegmentSemanticsMatch(
        _ left: TranscriptSegment,
        _ right: TranscriptSegment
    ) -> Bool {
        left.sourceExternalID == right.sourceExternalID
            && left.sourceTranscriptJobID
                == right.sourceTranscriptJobID
            && left.speaker == right.speaker
            && left.providerSpeaker == right.providerSpeaker
            && left.startTime == right.startTime
            && left.endTime == right.endTime
            && left.text == right.text
            && left.providerText == right.providerText
            && left.acceptedReviewExternalID
                == right.acceptedReviewExternalID
            && left.acceptedCorrectionExternalID
                == right.acceptedCorrectionExternalID
            && left.confidence == right.confidence
            && left.reviewStatus == right.reviewStatus
            && left.words.count == right.words.count
            && zip(left.words, right.words).allSatisfy { pair in
                canonicalTranscriptWordSemanticsMatch(
                    pair.0,
                    pair.1
                )
            }
    }

    private func reconcileCanonicalTranscriptSegments(
        _ incoming: [TranscriptSegment],
        against existing: [TranscriptSegment]
    ) -> [TranscriptSegment] {
        let existingSegments = existing.reduce(
            into: [String: TranscriptSegment]()
        ) { result, segment in
            guard let externalID = segment.sourceExternalID,
                  result[externalID] == nil else {
                return
            }
            result[externalID] = segment
        }
        return incoming.map { segment in
            guard let externalID = segment.sourceExternalID,
                  let prior = existingSegments[externalID] else {
                return segment
            }
            let priorWords = prior.words.reduce(
                into: [String: TranscriptWordTiming]()
            ) { result, word in
                guard let externalID = word.sourceExternalID,
                      result[externalID] == nil else {
                    return
                }
                result[externalID] = word
            }
            let reconciledWords = segment.words.map { word in
                guard let wordExternalID = word.sourceExternalID,
                      let priorWord = priorWords[wordExternalID] else {
                    return word
                }
                return TranscriptWordTiming(
                    id: priorWord.id,
                    sourceExternalID: word.sourceExternalID,
                    providerWordIndex: word.providerWordIndex,
                    word: word.word,
                    rawWord: word.rawWord,
                    startTime: word.startTime,
                    endTime: word.endTime,
                    confidence: word.confidence,
                    speaker: word.speaker,
                    channel: word.channel,
                    source: word.source
                )
            }
            let semanticsUnchanged =
                canonicalTranscriptSegmentSemanticsMatch(prior, segment)
            return TranscriptSegment(
                id: prior.id,
                sourceAssetId:
                    prior.sourceAssetId ?? segment.sourceAssetId,
                sourceExternalID: segment.sourceExternalID,
                sourceTranscriptJobID:
                    segment.sourceTranscriptJobID,
                speaker: segment.speaker,
                startTime: segment.startTime,
                endTime: segment.endTime,
                text: segment.text,
                providerText: segment.providerText,
                providerSpeaker: segment.providerSpeaker,
                acceptedReviewExternalID:
                    segment.acceptedReviewExternalID,
                acceptedCorrectionExternalID:
                    segment.acceptedCorrectionExternalID,
                words: reconciledWords,
                confidence: segment.confidence,
                reviewStatus: segment.reviewStatus,
                createdAt: prior.createdAt,
                updatedAt:
                    semanticsUnchanged ? prior.updatedAt : Date()
            )
        }
    }

    private func canonicalTranscriptLedgerJSON(
        transcriptJobID: String,
        segments: [TranscriptSegment]
    ) -> String {
        let payload: [String: Any] = [
            "schema": "quipsly-studio-transcript-import-receipt-v1",
            "transcriptJobId": transcriptJobID,
            "segments": segments.map { segment in
                [
                    "segmentId": segment.sourceExternalID ?? "",
                    "reviewStatus": segment.reviewStatus,
                    "acceptedReviewId":
                        segment.acceptedReviewExternalID
                        ?? NSNull(),
                    "acceptedCorrectionId":
                        segment.acceptedCorrectionExternalID
                        ?? NSNull(),
                    "wordIds": segment.words.compactMap(
                        \.sourceExternalID
                    ),
                ] as [String: Any]
            },
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(
                withJSONObject: payload,
                options: [.sortedKeys]
              ) else {
            return "{}"
        }
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    @discardableResult
    public func applyCanonicalTranscriptHandoff(
        transcriptJobID: String,
        provider: String,
        sourcePath: String,
        segments: [TranscriptSegment]
    ) throws -> Bool {
        guard var sequence = activeSequence else {
            throw CanonicalTranscriptImportError.noActiveSequence
        }
        guard !segments.isEmpty else {
            throw CanonicalTranscriptImportError.emptyHandoff
        }
        let segmentExternalIDs = segments.compactMap(
            \.sourceExternalID
        )
        let words = segments.flatMap(\.words)
        let wordExternalIDs = words.compactMap(\.sourceExternalID)
        let wordIndexes = words.compactMap(\.providerWordIndex)
        guard !transcriptJobID.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).isEmpty,
        segmentExternalIDs.count == segments.count,
        Set(segmentExternalIDs).count == segments.count,
        !words.isEmpty,
        wordExternalIDs.count == words.count,
        Set(wordExternalIDs).count == words.count,
        wordIndexes == Array(0 ..< words.count),
        segments.allSatisfy({ segment in
            segment.sourceTranscriptJobID == transcriptJobID
                && ((segment.acceptedReviewExternalID == nil
                        && segment.acceptedCorrectionExternalID == nil
                        && segment.reviewStatus == "provider")
                    || (segment.acceptedReviewExternalID?.isEmpty == false
                        && segment.reviewStatus
                            == "human-reviewed"))
                && segment.startTime.isFinite
                && segment.endTime.isFinite
                && segment.startTime >= 0
                && segment.endTime >= segment.startTime
                && !segment.words.isEmpty
                && segment.words.allSatisfy { word in
                    word.startTime.isFinite
                        && word.endTime.isFinite
                        && word.startTime >= segment.startTime
                        && word.endTime <= segment.endTime
                        && word.endTime >= word.startTime
                }
        }) else {
            throw CanonicalTranscriptImportError.invalidHandoff
        }
        let existingJobIDs = Set(
            sequence.transcriptSegments.compactMap(
                \.sourceTranscriptJobID
            )
        )
        if !sequence.transcriptSegments.isEmpty,
           existingJobIDs != Set([transcriptJobID]) {
            throw CanonicalTranscriptImportError
                .existingTranscriptHasDifferentIdentity
        }
        let reconciledSegments = reconcileCanonicalTranscriptSegments(
            segments,
            against: sequence.transcriptSegments
        )
        let segmentsUnchanged =
            sequence.transcriptSegments == reconciledSegments
        let hasCompletedJob = sequence.transcriptJobs.contains {
                $0.sourceExternalID == transcriptJobID
                    && $0.status == "completed"
            }
        let hasHandoffReceipt = sequence.editActionLedger.contains {
            $0.category == "transcript-handoff"
                && $0.endpoint == "nest-canonical-transcript"
                && $0.afterJson.contains(transcriptJobID)
        }
        let unchanged = segmentsUnchanged
            && hasCompletedJob
            && hasHandoffReceipt
        if unchanged {
            return true
        }

        let priorSegments = sequence.transcriptSegments
        sequence.transcriptSegments = reconciledSegments
        let priorJob = sequence.transcriptJobs.first {
            $0.sourceExternalID == transcriptJobID
        }
        let now = Date()
        let job = TranscriptJobRecord(
            id: priorJob?.id ?? UUID(),
            sourceExternalID: transcriptJobID,
            sourceLaneId: priorJob?.sourceLaneId,
            sourceLaneName: "Nest canonical transcript",
            sourcePath: sourcePath,
            provider: provider,
            status: "completed",
            startedAt: priorJob?.startedAt ?? now,
            completedAt: priorJob?.completedAt ?? now,
            segmentCount: reconciledSegments.count
        )
        if let index = sequence.transcriptJobs.firstIndex(where: {
            $0.sourceExternalID == transcriptJobID
        }) {
            sequence.transcriptJobs[index] = job
        } else {
            sequence.transcriptJobs.append(job)
        }
        sequence.editActionLedger.append(
            EditActionLedgerRecord(
                actor: "Nest",
                actorType: "system",
                actionId:
                    "canonical-transcript-import-\(UUID().uuidString)",
                actionLabel: priorSegments.isEmpty
                    ? "Import canonical transcript"
                    : segmentsUnchanged
                        ? "Record canonical transcript handoff"
                        : "Refresh reviewed transcript",
                category: "transcript-handoff",
                endpoint: "nest-canonical-transcript",
                sequenceTime: 0,
                beforeJson: canonicalTranscriptLedgerJSON(
                    transcriptJobID: transcriptJobID,
                    segments: priorSegments
                ),
                afterJson: canonicalTranscriptLedgerJSON(
                    transcriptJobID: transcriptJobID,
                    segments: reconciledSegments
                ),
                note:
                    "Provider words remain immutable; accepted corrections are provenance-linked overlays."
            )
        )
        updateSequence(
            sequence,
            undoManager: nil,
            actionName: "Import Canonical Transcript"
        )
        return false
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
