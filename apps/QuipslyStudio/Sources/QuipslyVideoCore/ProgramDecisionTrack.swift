import Foundation

/// The semantic program choice made at a sequence-time boundary.
///
/// These cases describe editorial intent, not a particular render layout. A
/// horizontal and vertical renderer may interpret the same event differently.
public enum ProgramDecisionKind: String, Codable, Equatable, CaseIterable, Sendable {
    case primary
    case secondary
    case both
    case skip
    case primaryWithClip
    case secondaryWithClip
    case bothWithClip
    case custom

    public var isSkipped: Bool { self == .skip }
}

/// Audio intent is independent from picture intent. This prevents a visible
/// camera from accidentally contributing scratch audio while still allowing a
/// watched clip or stinger to intentionally own the program mix.
public enum ProgramAudioPolicy: String, Codable, Equatable, CaseIterable, Sendable {
    case hostMix
    case selectedSources
    case hostMixAndSelectedSources
    case silence

    public var includesHostMix: Bool {
        self == .hostMix || self == .hostMixAndSelectedSources
    }

    public var includesSelectedSources: Bool {
        self == .selectedSources || self == .hostMixAndSelectedSources
    }
}

/// How a watched clip advances while the hosts remain live.
///
/// This is Program metadata. It never changes the source file or shared
/// sequence clock. A held clip frame can sit beside live host reactions and
/// return to normal playback at the next decision.
public enum ProgramClipMotion: String, Codable, Equatable, CaseIterable, Sendable {
    case playing
    case holdFrame
}

/// A sparse state change on the Program track. Its effective end is the next
/// event's start time, or the end of the sequence when there is no next event.
public struct ProgramDecisionEvent: Identifiable, Codable, Equatable, Sendable {
    public var id: UUID
    public var startTime: Double
    public var kind: ProgramDecisionKind
    public var sourceLaneIDs: [UUID]
    public var clipLaneID: UUID?
    public var clipMotion: ProgramClipMotion?
    /// Local source time, in seconds, used when `clipMotion` is `holdFrame`.
    public var clipHoldSourceTime: Double?
    public var audioPolicy: ProgramAudioPolicy?
    public var audioSourceLaneIDs: [UUID]?
    public var assemblySegmentID: UUID?
    public var assemblyLocalTime: Double?
    public var actor: String
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        startTime: Double,
        kind: ProgramDecisionKind,
        sourceLaneIDs: [UUID] = [],
        clipLaneID: UUID? = nil,
        clipMotion: ProgramClipMotion? = nil,
        clipHoldSourceTime: Double? = nil,
        audioPolicy: ProgramAudioPolicy? = nil,
        audioSourceLaneIDs: [UUID]? = nil,
        assemblySegmentID: UUID? = nil,
        assemblyLocalTime: Double? = nil,
        actor: String = "Quipsly Studio",
        createdAt: Date = Date()
    ) {
        self.id = id
        self.startTime = max(0, startTime)
        self.kind = kind
        self.sourceLaneIDs = Array(Set(sourceLaneIDs))
        self.clipLaneID = clipLaneID
        self.clipMotion = clipMotion
        self.clipHoldSourceTime = clipHoldSourceTime.map { max(0, $0) }
        self.audioPolicy = audioPolicy
        self.audioSourceLaneIDs = audioSourceLaneIDs.map { Array(Set($0)) }
        self.assemblySegmentID = assemblySegmentID
        self.assemblyLocalTime = assemblyLocalTime
        self.actor = actor.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "Quipsly Studio"
            : actor
        self.createdAt = createdAt
    }

    public var resolvedAudioPolicy: ProgramAudioPolicy {
        audioPolicy ?? .hostMix
    }

    public var resolvedClipMotion: ProgramClipMotion {
        clipMotion ?? .playing
    }

    public var resolvedAudioSourceLaneIDs: [UUID] {
        if let audioSourceLaneIDs, !audioSourceLaneIDs.isEmpty {
            return audioSourceLaneIDs
        }
        return clipLaneID.map { [$0] } ?? []
    }
}

public struct ProgramDecisionSpan: Equatable, Sendable {
    public var event: ProgramDecisionEvent
    public var startTime: Double
    public var endTime: Double

    public var duration: Double { max(0, endTime - startTime) }
}

public extension MediaSequence {
    var sortedProgramDecisions: [ProgramDecisionEvent] {
        programDecisions.sorted {
            if abs($0.startTime - $1.startTime) > 0.000_1 {
                return $0.startTime < $1.startTime
            }
            return $0.createdAt < $1.createdAt
        }
    }

    func programDecision(at sequenceTime: Double) -> ProgramDecisionEvent? {
        sortedProgramDecisions.last { $0.startTime <= sequenceTime + 0.000_1 }
    }

    func resolvedProgramDecisionSpans() -> [ProgramDecisionSpan] {
        let events = sortedProgramDecisions
        guard !events.isEmpty else { return [] }

        return events.enumerated().compactMap { index, event in
            let start = min(max(0, event.startTime), max(0, duration))
            let end = index + 1 < events.count
                ? min(max(start, events[index + 1].startTime), max(0, duration))
                : max(start, duration)
            guard end - start >= 0.000_1 else { return nil }
            return ProgramDecisionSpan(event: event, startTime: start, endTime: end)
        }
    }

    mutating func upsertProgramDecision(_ event: ProgramDecisionEvent, tolerance: Double = 1.0 / 600.0) {
        let boundedStart = min(max(0, event.startTime), max(0, duration))
        var replacement = event
        replacement.startTime = boundedStart

        programDecisions.removeAll { abs($0.startTime - boundedStart) <= tolerance }
        programDecisions.append(replacement)
        programDecisions.sort { $0.startTime < $1.startTime }
    }

    func programVisibleRanges(for laneID: UUID) -> [ClosedRange<Double>] {
        guard let availability = sourceAvailabilityRange(for: laneID) else { return [] }

        return resolvedProgramDecisionSpans().compactMap { span -> ClosedRange<Double>? in
            guard !span.event.kind.isSkipped,
                  span.event.sourceLaneIDs.contains(laneID),
                  span.duration > 0 else {
                return nil
            }
            return intersection(of: span.startTime...span.endTime, and: availability)
        }
    }

    /// Returns the portions of one editorial decision that are backed by at
    /// least one of its selected whole source lanes. The decision can continue
    /// across a source gap, but the gap is not playable media and must remain
    /// visibly blank in Program.
    func programPlayableRanges(in span: ProgramDecisionSpan) -> [ClosedRange<Double>] {
        guard !span.event.kind.isSkipped, span.duration > 0 else { return [] }

        let selectedLaneIDs = Array(Set(
            span.event.sourceLaneIDs + (span.event.clipLaneID.map { [$0] } ?? [])
        ))
        let decisionRange = span.startTime...span.endTime
        let backedRanges: [ClosedRange<Double>] = selectedLaneIDs.compactMap { laneID -> ClosedRange<Double>? in
            guard let availability = sourceAvailabilityRange(for: laneID) else { return nil }
            return intersection(of: decisionRange, and: availability)
        }
        return mergeProgramRanges(backedRanges)
    }

    func programPlayableRanges() -> [ClosedRange<Double>] {
        mergeProgramRanges(
            resolvedProgramDecisionSpans().flatMap { span in
                programPlayableRanges(in: span)
            }
        )
    }

    /// Returns sequence-time audio ranges for one lane. Host stems participate
    /// only when the policy includes the host mix. Camera/clip lanes participate
    /// only when they are explicitly named as selected audio sources.
    func programAudioRanges(for laneID: UUID, isHostMixLane: Bool) -> [ClosedRange<Double>] {
        guard let availability = sourceAvailabilityRange(for: laneID) else { return [] }

        let ranges = resolvedProgramDecisionSpans().compactMap { span -> ClosedRange<Double>? in
            let policy = span.event.resolvedAudioPolicy
            let isAudible = isHostMixLane
                ? policy.includesHostMix
                : policy.includesSelectedSources && span.event.resolvedAudioSourceLaneIDs.contains(laneID)
            guard isAudible, span.duration > 0 else { return nil }
            return intersection(of: span.startTime...span.endTime, and: availability)
        }
        return mergeProgramRanges(ranges)
    }

    private func sourceAvailabilityRange(for laneID: UUID) -> ClosedRange<Double>? {
        guard let source = lanes.first(where: { $0.id == laneID })?.sourceVideo else { return nil }
        let start = min(max(0, source.offset), max(0, duration))
        let end = min(max(start, source.offset + source.duration), max(0, duration))
        guard end - start >= 0.000_1 else { return nil }
        return start...end
    }

    private func intersection(
        of lhs: ClosedRange<Double>,
        and rhs: ClosedRange<Double>
    ) -> ClosedRange<Double>? {
        let start = max(lhs.lowerBound, rhs.lowerBound)
        let end = min(lhs.upperBound, rhs.upperBound)
        guard end - start >= 0.000_1 else { return nil }
        return start...end
    }

    private func mergeProgramRanges(_ ranges: [ClosedRange<Double>]) -> [ClosedRange<Double>] {
        let sorted = ranges.sorted { $0.lowerBound < $1.lowerBound }
        guard var current = sorted.first else { return [] }

        var merged: [ClosedRange<Double>] = []
        for range in sorted.dropFirst() {
            if range.lowerBound <= current.upperBound + 0.000_1 {
                current = current.lowerBound...max(current.upperBound, range.upperBound)
            } else {
                merged.append(current)
                current = range
            }
        }
        merged.append(current)
        return merged
    }
}
