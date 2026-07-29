import Foundation

/// A proposal-only response from a local editorial model.
///
/// Models cite transcript segment IDs. They do not own source-clock arithmetic,
/// mutate a sequence, create a Short, or make a keep/reject decision.
public struct LocalEditorialProposalEnvelope: Codable, Equatable, Sendable {
    public var schemaVersion: String
    public var provider: String
    public var model: String
    public var promptVersion: String
    public var candidates: [LocalEditorialCandidateProposal]

    public init(
        schemaVersion: String = "quipsly.local-editorial-proposals.v1",
        provider: String,
        model: String,
        promptVersion: String,
        candidates: [LocalEditorialCandidateProposal]
    ) {
        self.schemaVersion = schemaVersion
        self.provider = provider
        self.model = model
        self.promptVersion = promptVersion
        self.candidates = candidates
    }
}

public struct LocalEditorialCandidateProposal: Codable, Equatable, Sendable {
    public var startSegmentID: String
    public var endSegmentID: String
    public var title: String
    public var hook: String
    public var reason: String
    public var score: Double

    public init(
        startSegmentID: String,
        endSegmentID: String,
        title: String,
        hook: String,
        reason: String,
        score: Double
    ) {
        self.startSegmentID = startSegmentID
        self.endSegmentID = endSegmentID
        self.title = title
        self.hook = hook
        self.reason = reason
        self.score = score
    }
}

public struct ResolvedLocalEditorialCandidate: Codable, Equatable, Sendable {
    public var startSegmentID: UUID
    public var endSegmentID: UUID
    public var startTime: Double
    public var endTime: Double
    public var title: String
    public var hook: String
    public var reason: String
    public var score: Double
    public var provider: String
    public var model: String
    public var promptVersion: String
    public var status: String

    public var duration: Double {
        max(0, endTime - startTime)
    }
}

public struct RejectedLocalEditorialCandidate: Codable, Equatable, Sendable {
    public var candidateIndex: Int
    public var reason: String
}

public struct LocalEditorialResolution: Codable, Equatable, Sendable {
    public var accepted: [ResolvedLocalEditorialCandidate]
    public var rejected: [RejectedLocalEditorialCandidate]
}

public enum LocalEditorialProposalResolver {
    /// Resolves model-cited transcript IDs into source-clock proposals.
    ///
    /// This function is intentionally pure. Callers must require an explicit
    /// human action before materializing an accepted proposal as a Short.
    public static func resolve(
        _ envelope: LocalEditorialProposalEnvelope,
        against transcript: [TranscriptSegment],
        maximumDuration: Double = 100
    ) -> LocalEditorialResolution {
        let orderedTranscript = transcript.sorted {
            if $0.startTime == $1.startTime {
                return $0.endTime < $1.endTime
            }
            return $0.startTime < $1.startTime
        }
        var segmentIndex: [UUID: Int] = [:]
        var segmentByID: [UUID: TranscriptSegment] = [:]
        var duplicateSegmentIDs: Set<UUID> = []
        for (index, segment) in orderedTranscript.enumerated() {
            if segmentByID[segment.id] != nil {
                duplicateSegmentIDs.insert(segment.id)
                continue
            }
            segmentIndex[segment.id] = index
            segmentByID[segment.id] = segment
        }

        var accepted: [ResolvedLocalEditorialCandidate] = []
        var rejected: [RejectedLocalEditorialCandidate] = []

        for (candidateIndex, candidate) in envelope.candidates.enumerated() {
            guard
                let startID = UUID(uuidString: candidate.startSegmentID),
                let endID = UUID(uuidString: candidate.endSegmentID),
                let startSegment = segmentByID[startID],
                let endSegment = segmentByID[endID],
                let startIndex = segmentIndex[startID],
                let endIndex = segmentIndex[endID]
            else {
                rejected.append(.init(
                    candidateIndex: candidateIndex,
                    reason: "missing-or-invented-transcript-segment-id"
                ))
                continue
            }

            guard
                !duplicateSegmentIDs.contains(startID),
                !duplicateSegmentIDs.contains(endID)
            else {
                rejected.append(.init(
                    candidateIndex: candidateIndex,
                    reason: "ambiguous-duplicate-transcript-segment-id"
                ))
                continue
            }

            guard endIndex >= startIndex, endSegment.endTime > startSegment.startTime else {
                rejected.append(.init(
                    candidateIndex: candidateIndex,
                    reason: "reversed-or-empty-transcript-range"
                ))
                continue
            }

            let duration = endSegment.endTime - startSegment.startTime
            guard duration <= maximumDuration else {
                rejected.append(.init(
                    candidateIndex: candidateIndex,
                    reason: "range-exceeds-maximum-duration"
                ))
                continue
            }

            accepted.append(.init(
                startSegmentID: startID,
                endSegmentID: endID,
                startTime: startSegment.startTime,
                endTime: endSegment.endTime,
                title: candidate.title.trimmingCharacters(in: .whitespacesAndNewlines),
                hook: candidate.hook.trimmingCharacters(in: .whitespacesAndNewlines),
                reason: candidate.reason.trimmingCharacters(in: .whitespacesAndNewlines),
                score: min(1, max(0, candidate.score)),
                provider: envelope.provider,
                model: envelope.model,
                promptVersion: envelope.promptVersion,
                status: "proposal-not-applied"
            ))
        }

        return LocalEditorialResolution(accepted: accepted, rejected: rejected)
    }
}
