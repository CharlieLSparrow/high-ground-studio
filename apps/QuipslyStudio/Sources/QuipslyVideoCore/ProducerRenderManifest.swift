import Foundation

public struct ProducerRenderManifest: Decodable, Sendable {
    public struct Branch: Decodable, Sendable {
        public var id: String
        public var title: String
        public var target: String?
        public var editorialTradeoff: String?
        public var warning: String?

        public init(
            id: String,
            title: String,
            target: String? = nil,
            editorialTradeoff: String? = nil,
            warning: String? = nil
        ) {
            self.id = id
            self.title = title
            self.target = target
            self.editorialTradeoff = editorialTradeoff
            self.warning = warning
        }
    }

    public struct ProgramRange: Decodable, Sendable {
        public var start: Double
        public var end: Double
        public var reason: String?

        public init(start: Double, end: Double, reason: String? = nil) {
            self.start = start
            self.end = end
            self.reason = reason
        }
    }

    public struct PictureChunk: Decodable, Sendable {
        public var sequenceStart: Double
        public var sequenceEnd: Double
        public var sourceId: String
        public var sourcePath: String
        public var renderPath: String?
        public var sourceStart: Double
        public var pictureDecisionId: String?
        public var pictureDecisionReason: String?

        public init(
            sequenceStart: Double,
            sequenceEnd: Double,
            sourceId: String,
            sourcePath: String,
            renderPath: String? = nil,
            sourceStart: Double,
            pictureDecisionId: String? = nil,
            pictureDecisionReason: String? = nil
        ) {
            self.sequenceStart = sequenceStart
            self.sequenceEnd = sequenceEnd
            self.sourceId = sourceId
            self.sourcePath = sourcePath
            self.renderPath = renderPath
            self.sourceStart = sourceStart
            self.pictureDecisionId = pictureDecisionId
            self.pictureDecisionReason = pictureDecisionReason
        }
    }

    public struct OutputArtifact: Decodable, Sendable {
        public var path: String

        public init(path: String) {
            self.path = path
        }
    }

    public var schema: String?
    public var branch: Branch
    public var ranges: [ProgramRange]
    public var chunks: [PictureChunk]
    public var outputs: [String: OutputArtifact]

    public init(
        schema: String? = nil,
        branch: Branch,
        ranges: [ProgramRange],
        chunks: [PictureChunk],
        outputs: [String: OutputArtifact] = [:]
    ) {
        self.schema = schema
        self.branch = branch
        self.ranges = ranges
        self.chunks = chunks
        self.outputs = outputs
    }

    public init(contentsOf url: URL) throws {
        self = try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
        try validate()
    }

    public var outputPaths: [String] {
        outputs.values.map(\.path).sorted()
    }

    public func validate() throws {
        guard !branch.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ProducerRenderImportError.invalidManifest("The render branch id is empty.")
        }
        guard !branch.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ProducerRenderImportError.invalidManifest("The render branch title is empty.")
        }
        guard !ranges.isEmpty else {
            throw ProducerRenderImportError.invalidManifest("The render manifest has no program keep ranges.")
        }
        guard !chunks.isEmpty else {
            throw ProducerRenderImportError.invalidManifest("The render manifest has no picture decisions.")
        }
        guard ranges.allSatisfy({ $0.start.isFinite && $0.end.isFinite && $0.start >= 0 && $0.end > $0.start }) else {
            throw ProducerRenderImportError.invalidManifest("A program keep range is invalid.")
        }
        guard chunks.allSatisfy({
            $0.sequenceStart.isFinite && $0.sequenceEnd.isFinite && $0.sourceStart.isFinite
                && $0.sequenceStart >= 0 && $0.sequenceEnd > $0.sequenceStart && $0.sourceStart >= 0
        }) else {
            throw ProducerRenderImportError.invalidManifest("A picture decision is invalid.")
        }
    }
}

public struct ProducerRenderImportResult: Equatable, Sendable {
    public var sequenceId: UUID
    public var branchName: String
    public var keepRangeCount: Int
    public var pictureDecisionCount: Int
    public var outputArtifactCount: Int
}

public enum ProducerRenderImportError: LocalizedError, Equatable {
    case noActiveSequence
    case invalidManifest(String)
    case unmatchedPictureSources([String])

    public var errorDescription: String? {
        switch self {
        case .noActiveSequence:
            return "No active sequence is available for the render branch."
        case .invalidManifest(let message):
            return message
        case .unmatchedPictureSources(let sources):
            return "The render branch references unmatched picture sources: \(sources.joined(separator: ", "))."
        }
    }
}

public extension ProjectStore {
    @discardableResult
    func importProducerRenderManifest(
        _ manifest: ProducerRenderManifest,
        manifestURL: URL,
        createdBy: String = "Codex producer",
        undoManager: UndoManager? = nil
    ) throws -> ProducerRenderImportResult {
        try manifest.validate()
        guard let sourceSequence = activeSequence else {
            throw ProducerRenderImportError.noActiveSequence
        }

        var branchLanes = sourceSequence.lanes
        for index in branchLanes.indices where !Self.isAudioOnlyLane(branchLanes[index]) {
            branchLanes[index].tags.removeAll { $0.type == .active || $0.type == .cut }
        }

        var unmatchedSources: Set<String> = []
        var importedDecisionCount = 0
        for chunk in manifest.chunks {
            guard let laneIndex = Self.bestLaneIndex(for: chunk, in: branchLanes) else {
                unmatchedSources.insert(chunk.sourceId)
                continue
            }
            let offset = branchLanes[laneIndex].sourceVideo?.offset ?? 0
            let localStart = chunk.sequenceStart - offset
            let duration = chunk.sequenceEnd - chunk.sequenceStart
            guard localStart >= -0.05, duration > 0 else {
                unmatchedSources.insert(chunk.sourceId)
                continue
            }
            branchLanes[laneIndex].tags.append(
                VideoTag(type: .active, startTime: max(0, localStart), duration: duration)
            )
            importedDecisionCount += 1
        }

        guard unmatchedSources.isEmpty else {
            throw ProducerRenderImportError.unmatchedPictureSources(unmatchedSources.sorted())
        }

        for index in branchLanes.indices {
            branchLanes[index].tags.sort { lhs, rhs in
                if lhs.startTime == rhs.startTime { return lhs.duration < rhs.duration }
                return lhs.startTime < rhs.startTime
            }
        }

        let now = Date()
        let branchName = manifest.branch.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let sourceBaselineId = sourceSequence.branchMetadata.sourceBaselineSequenceId ?? sourceSequence.id
        let branchMetadata = EditBranchMetadata(
            branchName: branchName,
            branchRole: "longform",
            parentSequenceId: sourceSequence.id,
            sourceBaselineSequenceId: sourceBaselineId,
            branchStatus: "rendered-candidate",
            branchPurpose: manifest.branch.editorialTradeoff ?? manifest.branch.warning ?? "Imported producer render branch.",
            createdBy: createdBy,
            createdAt: now,
            updatedAt: now,
            programKeepRanges: manifest.ranges.map {
                EditBranchProgramRange(startTime: $0.start, endTime: $0.end, reason: $0.reason ?? "")
            },
            renderManifestPath: manifestURL.standardizedFileURL.path,
            renderArtifactPaths: manifest.outputPaths,
            renderVersion: manifest.branch.id,
            renderTarget: manifest.branch.target,
            renderEditorialTradeoff: manifest.branch.editorialTradeoff
        )

        let branchSequence = MediaSequence(
            title: branchName,
            orientationTrack: sourceSequence.orientationTrack,
            verticalOrientationTrack: sourceSequence.verticalOrientationTrack,
            lanes: branchLanes,
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
        updateProject(modifiedProject, undoManager: undoManager, actionName: "Import Producer Render Branch")
        activeSequenceId = branchSequence.id
        objectWillChange.send()

        return ProducerRenderImportResult(
            sequenceId: branchSequence.id,
            branchName: branchName,
            keepRangeCount: manifest.ranges.count,
            pictureDecisionCount: importedDecisionCount,
            outputArtifactCount: manifest.outputPaths.count
        )
    }

    private static func bestLaneIndex(
        for chunk: ProducerRenderManifest.PictureChunk,
        in lanes: [VideoLane]
    ) -> Int? {
        let visualIndices = lanes.indices.filter { !isAudioOnlyLane(lanes[$0]) }
        let normalizedRenderPath = chunk.renderPath.map(normalizedPath)
        if let normalizedRenderPath {
            let proxyMatches = visualIndices.filter { index in
                candidateProxyPaths(for: lanes[index]).contains(normalizedRenderPath)
            }
            if proxyMatches.count == 1 { return proxyMatches[0] }
            if let best = bestTimingMatch(for: chunk, candidates: proxyMatches, lanes: lanes) { return best }
        }

        let normalizedSourcePath = normalizedPath(chunk.sourcePath)
        let sourceMatches = visualIndices.filter { index in
            candidateSourcePaths(for: lanes[index]).contains(normalizedSourcePath)
        }
        if sourceMatches.count == 1 { return sourceMatches[0] }
        return bestTimingMatch(for: chunk, candidates: sourceMatches, lanes: lanes)
    }

    private static func bestTimingMatch(
        for chunk: ProducerRenderManifest.PictureChunk,
        candidates: [Int],
        lanes: [VideoLane]
    ) -> Int? {
        candidates.min { lhs, rhs in
            let lhsOffset = lanes[lhs].sourceVideo?.offset ?? 0
            let rhsOffset = lanes[rhs].sourceVideo?.offset ?? 0
            let lhsDelta = abs((chunk.sequenceStart - lhsOffset) - chunk.sourceStart)
            let rhsDelta = abs((chunk.sequenceStart - rhsOffset) - chunk.sourceStart)
            return lhsDelta < rhsDelta
        }
    }

    private static func candidateSourcePaths(for lane: VideoLane) -> Set<String> {
        Set([
            lane.sourceVideo?.mediaURL.path,
            lane.metadata?.sourcePath,
            lane.metadata?.originalPath,
            lane.metadata?.vaultRawPath
        ].compactMap { value in
            guard let value, !value.isEmpty else { return nil }
            return normalizedPath(value)
        })
    }

    private static func candidateProxyPaths(for lane: VideoLane) -> Set<String> {
        Set([
            lane.sourceVideo?.proxyURL?.path,
            lane.metadata?.vaultProxyPath
        ].compactMap { value in
            guard let value, !value.isEmpty else { return nil }
            return normalizedPath(value)
        })
    }

    private static func normalizedPath(_ value: String) -> String {
        let path: String
        if value.hasPrefix("file://"), let url = URL(string: value) {
            path = url.path
        } else {
            path = value
        }
        return URL(fileURLWithPath: path).standardizedFileURL.path.lowercased()
    }

    private static func isAudioOnlyLane(_ lane: VideoLane) -> Bool {
        let role = lane.metadata?.role.lowercased() ?? lane.name.lowercased()
        let kind = lane.metadata?.mediaKind.lowercased() ?? ""
        let sourceExtension = lane.sourceVideo?.mediaURL.pathExtension.lowercased() ?? ""
        let audioExtensions: Set<String> = ["wav", "aif", "aiff", "mp3", "m4a", "aac", "flac"]
        return role.contains("audio") || role.contains("dialogue") || kind == "audio" || audioExtensions.contains(sourceExtension)
    }
}
