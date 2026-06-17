import Foundation
import AVFoundation
import Combine

@MainActor
public final class PlaybackEngine: ObservableObject {
    @Published public var playhead: Double = 0
    @Published public var isPlaying: Bool = false
    @Published public var playbackMode: PlaybackMode = .playEdit
    @Published public var playbackFormat: ExportFormat = .horizontal16x9
    
    public var player: AVPlayer? {
        willSet {
            if let token = timeObserverToken {
                player?.removeTimeObserver(token)
                timeObserverToken = nil
            }
        }
        didSet {
            setupTimeObserver()
        }
    }
    
    private var timeObserverToken: Any?
    
    @Published public var sourcePlayers: [UUID: AVPlayer] = [:]
    private var sourceOffsets: [UUID: Double] = [:]
    private var sourceDurations: [UUID: Double] = [:]
    
    public var validRanges: [ClosedRange<Double>] = []
    
    public init() {}
    
    public func updateSourcePlayers(for sequence: MediaSequence) {
        var newPlayers: [UUID: AVPlayer] = [:]
        var newOffsets: [UUID: Double] = [:]
        var newDurations: [UUID: Double] = [:]
        
        for lane in sequence.lanes {
            if let sv = lane.sourceVideo {
                let ext = sv.mediaURL.pathExtension.lowercased()
                let audioOnlyExtensions = ["wav", "aif", "aiff", "mp3", "m4a", "aac", "flac"]
                let isAudioOnly = audioOnlyExtensions.contains(ext)
                
                if !isAudioOnly {
                    guard let playbackURL = sv.proxyURL else {
                        continue
                    }
                    guard !Self.isProtectedMediaPath(playbackURL.path) else {
                        continue
                    }
                    guard FileManager.default.fileExists(atPath: playbackURL.path) else {
                        continue
                    }
                    let p = AVPlayer(url: playbackURL)
                    p.isMuted = true // Only program audio
                    newPlayers[lane.id] = p
                    newOffsets[lane.id] = sv.offset
                    newDurations[lane.id] = sv.duration
                }
            }
        }
        self.sourcePlayers = newPlayers
        self.sourceOffsets = newOffsets
        self.sourceDurations = newDurations
        updateValidRanges(for: sequence)
        syncSourcePlayers(to: playhead)
    }

    private nonisolated static func isProtectedMediaPath(_ path: String) -> Bool {
        let home = FileManager.default.homeDirectoryForCurrentUser.standardizedFileURL.path
        let protectedPrefixes = [
            home + "/Desktop/",
            home + "/Documents/",
            home + "/Downloads/",
            home + "/Library/Mobile Documents/",
            "/Volumes/"
        ]
        return protectedPrefixes.contains { path == String($0.dropLast()) || path.hasPrefix($0) }
    }
    
    public func updateValidRanges(for sequence: MediaSequence) {
        if playbackMode == .playThrough {
            validRanges = [0...max(sequence.duration, 0)]
        } else {
            validRanges = Self.computeValidRanges(for: sequence)
        }
    }
    
    public nonisolated static func computeValidRanges(for sequence: MediaSequence) -> [ClosedRange<Double>] {
        let decisionLanes = primaryEditDecisionLanes(in: sequence)
        let primaryActiveRanges = collectRanges(type: .active, lanes: decisionLanes, sequenceDuration: sequence.duration)
        let fallbackActiveRanges = collectRanges(type: .active, lanes: sequence.lanes, sequenceDuration: sequence.duration)
        let activeRanges = primaryActiveRanges.isEmpty ? fallbackActiveRanges : primaryActiveRanges
        let mergedActiveRanges = mergeRanges(activeRanges)
        guard !mergedActiveRanges.isEmpty else { return [] }
        let mergedGlobalSkipRanges = mergeRanges(globalSkipRanges(in: decisionLanes, sequenceDuration: sequence.duration))
        guard !mergedGlobalSkipRanges.isEmpty else { return mergedActiveRanges }
        return subtract(mergedGlobalSkipRanges, from: mergedActiveRanges)
    }

    private nonisolated static func mergeRanges(_ ranges: [ClosedRange<Double>]) -> [ClosedRange<Double>] {
        guard !ranges.isEmpty else { return [] }
        let sorted = ranges.sorted { $0.lowerBound < $1.lowerBound }
        var merged: [ClosedRange<Double>] = []
        for range in sorted {
            if let last = merged.last, last.upperBound >= range.lowerBound {
                merged[merged.count - 1] = last.lowerBound...max(last.upperBound, range.upperBound)
            } else {
                merged.append(range)
            }
        }
        return merged
    }

    private nonisolated static func subtract(_ cuts: [ClosedRange<Double>], from ranges: [ClosedRange<Double>]) -> [ClosedRange<Double>] {
        guard !cuts.isEmpty else { return ranges }

        var remaining: [ClosedRange<Double>] = ranges
        for cut in cuts {
            var next: [ClosedRange<Double>] = []
            for range in remaining {
                if cut.upperBound <= range.lowerBound || cut.lowerBound >= range.upperBound {
                    next.append(range)
                    continue
                }

                let leftEnd = min(cut.lowerBound, range.upperBound)
                if range.lowerBound < leftEnd {
                    next.append(range.lowerBound...leftEnd)
                }

                let rightStart = max(cut.upperBound, range.lowerBound)
                if rightStart < range.upperBound {
                    next.append(rightStart...range.upperBound)
                }
            }
            remaining = next
            if remaining.isEmpty { break }
        }

        return remaining
    }

    private nonisolated static func primaryEditDecisionLanes(in sequence: MediaSequence) -> [VideoLane] {
        let visualLanes = sequence.lanes.filter { !isSupportOnlyLane($0) }
        return visualLanes.isEmpty ? sequence.lanes : visualLanes
    }

    private nonisolated static func isSupportOnlyLane(_ lane: VideoLane) -> Bool {
        let role = lane.metadata?.role.lowercased() ?? lane.name.lowercased()
        let kind = lane.metadata?.mediaKind.lowercased() ?? ""
        let sourceExtension = lane.sourceVideo?.mediaURL.pathExtension.lowercased() ?? ""
        let audioExtensions: Set<String> = ["wav", "aif", "aiff", "mp3", "m4a", "aac", "flac"]
        return role.contains("audio") || kind == "audio" || audioExtensions.contains(sourceExtension)
    }

    private nonisolated static func collectRanges(
        type: TagType,
        lanes: [VideoLane],
        sequenceDuration: Double
    ) -> [ClosedRange<Double>] {
        lanes.flatMap { lane in
            lane.tags
                .filter { $0.type == type }
                .compactMap { tag in sequenceRange(for: tag, lane: lane, sequenceDuration: sequenceDuration) }
        }
    }

    private nonisolated static func sequenceRange(
        for tag: VideoTag,
        lane: VideoLane,
        sequenceDuration: Double
    ) -> ClosedRange<Double>? {
        let offset = lane.sourceVideo?.offset ?? 0
        let rawStart = tag.startTime + offset
        let rawEnd = rawStart + tag.duration
        let start = max(0, rawStart)
        let end = min(sequenceDuration, rawEnd)
        guard start < end else { return nil }
        return start...end
    }

    private nonisolated static func globalSkipRanges(
        in lanes: [VideoLane],
        sequenceDuration: Double
    ) -> [ClosedRange<Double>] {
        var commonCutRanges: [ClosedRange<Double>]?

        for lane in lanes {
            let laneCuts = mergeRanges(
                lane.tags
                    .filter { $0.type == .cut }
                    .compactMap { tag in sequenceRange(for: tag, lane: lane, sequenceDuration: sequenceDuration) }
            )
            guard !laneCuts.isEmpty else { return [] }

            if let existing = commonCutRanges {
                commonCutRanges = intersect(existing, laneCuts)
            } else {
                commonCutRanges = laneCuts
            }

            if commonCutRanges?.isEmpty == true { return [] }
        }

        return commonCutRanges ?? []
    }

    private nonisolated static func intersect(
        _ lhs: [ClosedRange<Double>],
        _ rhs: [ClosedRange<Double>]
    ) -> [ClosedRange<Double>] {
        var intersections: [ClosedRange<Double>] = []
        for left in lhs {
            for right in rhs {
                let start = max(left.lowerBound, right.lowerBound)
                let end = min(left.upperBound, right.upperBound)
                if start < end {
                    intersections.append(start...end)
                }
            }
        }
        return mergeRanges(intersections)
    }
    
    public func programTime(from sequenceTime: Double) -> Double {
        if playbackMode == .playThrough { return sequenceTime }
        var pTime: Double = 0
        for range in validRanges {
            if sequenceTime < range.lowerBound {
                break
            } else if sequenceTime <= range.upperBound {
                pTime += (sequenceTime - range.lowerBound)
                break
            } else {
                pTime += (range.upperBound - range.lowerBound)
            }
        }
        return pTime
    }
    
    public func sequenceTime(from programTime: Double) -> Double {
        if playbackMode == .playThrough { return programTime }
        if validRanges.isEmpty { return 0 }
        
        var remainingPTime = programTime
        for range in validRanges {
            let duration = range.upperBound - range.lowerBound
            if remainingPTime <= duration {
                return range.lowerBound + remainingPTime
            }
            remainingPTime -= duration
        }
        return validRanges.last!.upperBound
    }
    
    private func syncSourcePlayers(
        to timeInSeconds: Double,
        tolerance: CMTime = .zero,
        cancelPending: Bool = false
    ) {
        for (id, p) in sourcePlayers {
            let offset = sourceOffsets[id] ?? 0
            let duration = sourceDurations[id] ?? .infinity
            let mediaTime = min(max(0, timeInSeconds - offset), duration)
            if cancelPending {
                p.currentItem?.cancelPendingSeeks()
            }
            p.seek(
                to: CMTime(seconds: mediaTime, preferredTimescale: 600),
                toleranceBefore: tolerance,
                toleranceAfter: tolerance
            )
        }
    }

    public func sourcePlayerTime(laneId: UUID) -> Double? {
        guard let seconds = sourcePlayers[laneId]?.currentTime().seconds,
              seconds.isFinite else {
            return nil
        }
        return seconds
    }

    public func expectedSourcePlayerTime(laneId: UUID, sequenceTime: Double? = nil) -> Double? {
        guard sourcePlayers[laneId] != nil else { return nil }
        let offset = sourceOffsets[laneId] ?? 0
        let duration = sourceDurations[laneId] ?? .infinity
        return min(max(0, (sequenceTime ?? playhead) - offset), duration)
    }
    
    public func play() {
        guard let player = player else { return }
        syncSourcePlayers(to: playhead)
        player.play()
        sourcePlayers.values.forEach { $0.play() }
        isPlaying = true
    }
    
    public func pause() {
        player?.pause()
        sourcePlayers.values.forEach { $0.pause() }
        isPlaying = false
    }
    
    public func togglePlayback() {
        if isPlaying {
            pause()
        } else {
            play()
        }
    }
    
    public func seek(to timeInSeconds: Double) {
        playhead = timeInSeconds
        syncSourcePlayers(to: timeInSeconds, tolerance: .zero, cancelPending: true)
        guard let player = player else { return }
        player.currentItem?.cancelPendingSeeks()
        let pTime = programTime(from: timeInSeconds)
        let time = CMTime(seconds: pTime, preferredTimescale: 600)
        player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
    }

    public func scrub(to timeInSeconds: Double) {
        playhead = timeInSeconds
        let tolerance = CMTime(seconds: 0.08, preferredTimescale: 600)
        syncSourcePlayers(to: timeInSeconds, tolerance: tolerance, cancelPending: true)
        guard let player = player else { return }
        player.currentItem?.cancelPendingSeeks()
        let pTime = programTime(from: timeInSeconds)
        let time = CMTime(seconds: pTime, preferredTimescale: 600)
        player.seek(to: time, toleranceBefore: tolerance, toleranceAfter: tolerance)
    }
    
    private func setupTimeObserver() {
        guard let player = player else { return }
        
        let interval = CMTime(seconds: 1.0 / 60.0, preferredTimescale: 600)
        timeObserverToken = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                guard let self = self else { return }
                if self.isPlaying {
                    let pTime = time.seconds
                    let sTime = self.sequenceTime(from: pTime)
                    self.playhead = sTime
                    self.syncSourcePlayers(to: sTime)
                }
            }
        }
    }
}
