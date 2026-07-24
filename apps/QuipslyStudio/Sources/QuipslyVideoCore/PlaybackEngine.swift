import Foundation
import AVFoundation
import Combine

@MainActor
public final class PlaybackEngine: ObservableObject {
    @Published public var playhead: Double = 0
    @Published public var isPlaying: Bool = false
    @Published public private(set) var isAuditioning: Bool = false
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
    private var auditionPlayer: AVPlayer?
    private var auditionTimeObserverToken: Any?
    private var auditionStopAtSeconds: Double?
    private var auditionLoopStartSeconds: Double?
    private let auditionObserverQueue = DispatchQueue(
        label: "com.highground.quipsly.playback.audition-clock",
        qos: .userInteractive
    )

    @Published public var sourcePlayers: [UUID: AVPlayer] = [:]
    private var sourceOffsets: [UUID: Double] = [:]
    private var sourceDurations: [UUID: Double] = [:]

    public var validRanges: [ClosedRange<Double>] = []
    public private(set) var sequenceDuration: Double = 0

    public init() {}

    public func updateSourcePlayers(
        for sequence: MediaSequence,
        allowedProxyRootPath: String? = nil
    ) {
        var newPlayers: [UUID: AVPlayer] = [:]
        var newOffsets: [UUID: Double] = [:]
        var newDurations: [UUID: Double] = [:]

        for lane in sequence.lanes {
            if lane.metadata?.ignoreForProduction == true {
                continue
            }
            if let sv = lane.sourceVideo {
                let ext = sv.mediaURL.pathExtension.lowercased()
                let audioOnlyExtensions = ["wav", "aif", "aiff", "mp3", "m4a", "aac", "flac"]
                let isAudioOnly = audioOnlyExtensions.contains(ext)

                if !isAudioOnly {
                    guard let playbackURL = sv.proxyURL else {
                        continue
                    }
                    guard !Self.isProtectedMediaPath(playbackURL.path)
                        || Self.isPath(playbackURL.path, inside: allowedProxyRootPath) else {
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
        let safePlayhead = boundedSequenceTime(playhead)
        if safePlayhead != playhead {
            playhead = safePlayhead
        }
        syncSourcePlayers(to: safePlayhead)
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

    private nonisolated static func isPath(_ path: String, inside rootPath: String?) -> Bool {
        guard let rootPath, !rootPath.isEmpty else { return false }
        let root = URL(fileURLWithPath: rootPath, isDirectory: true).standardizedFileURL.path
        let candidate = URL(fileURLWithPath: path).standardizedFileURL.path
        return candidate == root || candidate.hasPrefix(root + "/")
    }

    public func updateValidRanges(for sequence: MediaSequence) {
        sequenceDuration = max(sequence.duration, 0)
        if playbackMode == .playThrough {
            validRanges = [0...sequenceDuration]
        } else {
            validRanges = Self.computeValidRanges(for: sequence)
        }
    }

    private func boundedSequenceTime(_ timeInSeconds: Double) -> Double {
        guard timeInSeconds.isFinite else { return 0 }
        guard sequenceDuration > 0 else { return max(0, timeInSeconds) }
        return min(max(0, timeInSeconds), sequenceDuration)
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
        let productionLanes = sequence.lanes.filter { $0.metadata?.ignoreForProduction != true }
        let visualLanes = productionLanes.filter { !isSupportOnlyLane($0) }
        return visualLanes.isEmpty ? productionLanes : visualLanes
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
        let sequenceTime = boundedSequenceTime(timeInSeconds)
        for (id, p) in sourcePlayers {
            let offset = sourceOffsets[id] ?? 0
            let duration = sourceDurations[id] ?? .infinity
            let mediaTime = min(max(0, sequenceTime - offset), duration)
            if cancelPending {
                p.currentItem?.cancelPendingSeeks()
            }
            let currentTime = p.currentTime().seconds
            let toleranceSeconds = tolerance.seconds.isFinite ? tolerance.seconds : 0
            let driftThreshold = max(toleranceSeconds, 0.08)
            if !cancelPending,
               currentTime.isFinite,
               abs(currentTime - mediaTime) <= driftThreshold {
                continue
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
        if isAuditioning {
            endAudition(at: playhead)
        }
        guard let player = player else { return }
        let safePlayhead = boundedSequenceTime(playhead)
        if safePlayhead != playhead {
            playhead = safePlayhead
        }
        syncSourcePlayers(to: safePlayhead)
        player.play()
        sourcePlayers.values.forEach { $0.play() }
        isPlaying = true
    }

    public func pause() {
        if isAuditioning {
            if let currentTime = auditionClockTime() {
                playhead = currentTime
            }
            auditionPlayer?.pause()
            sourcePlayers.values.forEach { $0.pause() }
            player?.pause()
            isPlaying = false
            return
        }
        player?.pause()
        sourcePlayers.values.forEach { $0.pause() }
        isPlaying = false
    }

    /// Reads the sample-accurate audition transport without publishing a
    /// high-frequency editor-wide state change. Audio Room samples this value
    /// into its local visual clock; explicit transport commands commit it back
    /// to `playhead`.
    public func auditionClockTime() -> Double? {
        guard isAuditioning, let seconds = auditionPlayer?.currentTime().seconds, seconds.isFinite else {
            return nil
        }
        return boundedSequenceTime(seconds)
    }

    /// Starts source-aware auditioning on the editor's one shared sequence clock.
    /// PlaybackEngine owns the player so program, source monitors, keyboard
    /// transport, scrubbing, range stops, and loops cannot diverge.
    public func startAudition(
        item: AVPlayerItem,
        at timeInSeconds: Double,
        stopAt: Double? = nil,
        loopStart: Double? = nil
    ) {
        teardownAuditionPlayer()
        player?.pause()
        sourcePlayers.values.forEach { $0.pause() }
        let safeTime = boundedSequenceTime(timeInSeconds)
        auditionStopAtSeconds = stopAt.map { boundedSequenceTime(max($0, safeTime + 0.05)) }
        auditionLoopStartSeconds = loopStart.map { boundedSequenceTime(min(max($0, 0), safeTime)) }
        let nextPlayer = AVPlayer(playerItem: item)
        auditionPlayer = nextPlayer
        isAuditioning = true
        isPlaying = false
        updateSharedClock(to: safeTime, tolerance: .zero, cancelPending: true)
        attachAuditionTimeObserver(to: nextPlayer)

        let target = CMTime(seconds: safeTime, preferredTimescale: 600)
        nextPlayer.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self, weak nextPlayer] finished in
            Task { @MainActor in
                guard finished,
                      let self,
                      let nextPlayer,
                      self.isAuditioning,
                      self.auditionPlayer === nextPlayer else { return }
                self.isPlaying = true
                nextPlayer.play()
            }
        }
    }

    public func endAudition(at timeInSeconds: Double? = nil) {
        let safeTime = boundedSequenceTime(timeInSeconds ?? playhead)
        teardownAuditionPlayer()
        updateSharedClock(to: safeTime, tolerance: .zero, cancelPending: true)
        isAuditioning = false
        isPlaying = false
    }

    public func togglePlayback() {
        if isAuditioning, let auditionPlayer {
            if isPlaying {
                pause()
            } else {
                auditionPlayer.play()
                isPlaying = true
            }
            return
        }
        if isPlaying {
            pause()
        } else {
            play()
        }
    }

    public func seek(to timeInSeconds: Double) {
        let safeTime = boundedSequenceTime(timeInSeconds)
        if isAuditioning {
            auditionPlayer?.currentItem?.cancelPendingSeeks()
            auditionPlayer?.seek(
                to: CMTime(seconds: safeTime, preferredTimescale: 600),
                toleranceBefore: .zero,
                toleranceAfter: .zero
            )
        }
        updateSharedClock(to: safeTime, tolerance: .zero, cancelPending: true)
    }

    public func scrub(to timeInSeconds: Double) {
        let safeTime = boundedSequenceTime(timeInSeconds)
        let tolerance = CMTime(seconds: 0.08, preferredTimescale: 600)
        if isAuditioning {
            auditionPlayer?.currentItem?.cancelPendingSeeks()
            auditionPlayer?.seek(
                to: CMTime(seconds: safeTime, preferredTimescale: 600),
                toleranceBefore: tolerance,
                toleranceAfter: tolerance
            )
        }
        updateSharedClock(to: safeTime, tolerance: tolerance, cancelPending: true)
    }

    private func attachAuditionTimeObserver(to player: AVPlayer) {
        // Audio stays sample-accurate inside AVPlayer. The editor only needs a
        // modest visual control rate; driving every AVPlayerView seek at 30 Hz
        // overwhelms SwiftUI and can mutate state during a view transaction.
        let interval = CMTime(seconds: 0.20, preferredTimescale: 600)
        auditionTimeObserverToken = player.addPeriodicTimeObserver(
            forInterval: interval,
            queue: auditionObserverQueue
        ) { [weak self, weak player] time in
            Task { @MainActor in
                await Task.yield()
                guard let self,
                      let player,
                      self.isAuditioning,
                      self.auditionPlayer === player else { return }
                let seconds = time.seconds
                guard seconds.isFinite else { return }
                let safeTime = self.boundedSequenceTime(seconds)
                // The audition AVPlayer is the authoritative monotonic clock.
                // Do not publish every observation through the editor-wide
                // ObservableObject; Audio Room samples this clock locally.

                guard let stopAt = self.auditionStopAtSeconds, safeTime >= stopAt else { return }
                if let loopStart = self.auditionLoopStartSeconds {
                    let target = self.boundedSequenceTime(loopStart)
                    await player.seek(
                        to: CMTime(seconds: target, preferredTimescale: 600),
                        toleranceBefore: .zero,
                        toleranceAfter: .zero
                    )
                    self.updateSharedClock(to: target, tolerance: .zero, cancelPending: true)
                    player.play()
                } else {
                    self.endAudition(at: stopAt)
                }
            }
        }
    }

    private func teardownAuditionPlayer() {
        if let auditionTimeObserverToken {
            auditionPlayer?.removeTimeObserver(auditionTimeObserverToken)
            self.auditionTimeObserverToken = nil
        }
        auditionPlayer?.pause()
        auditionPlayer = nil
        auditionStopAtSeconds = nil
        auditionLoopStartSeconds = nil
    }

    private func updateSharedClock(
        to timeInSeconds: Double,
        tolerance: CMTime,
        cancelPending: Bool
    ) {
        let safeTime = boundedSequenceTime(timeInSeconds)
        playhead = safeTime
        syncSourcePlayers(to: safeTime, tolerance: tolerance, cancelPending: cancelPending)
        seekProgramPlayer(toSequenceTime: safeTime, tolerance: tolerance, cancelPending: cancelPending)
    }

    private func seekProgramPlayer(
        toSequenceTime sequenceTime: Double,
        tolerance: CMTime,
        cancelPending: Bool = false
    ) {
        guard let player else { return }
        let targetSeconds = programTime(from: sequenceTime)
        let currentSeconds = player.currentTime().seconds
        let toleranceSeconds = tolerance.seconds.isFinite ? tolerance.seconds : 0
        let driftThreshold = max(toleranceSeconds, 0.08)
        if !cancelPending,
           currentSeconds.isFinite,
           abs(currentSeconds - targetSeconds) <= driftThreshold {
            return
        }
        if cancelPending {
            player.currentItem?.cancelPendingSeeks()
        }
        let time = CMTime(seconds: targetSeconds, preferredTimescale: 600)
        player.seek(to: time, toleranceBefore: tolerance, toleranceAfter: tolerance)
    }

    private func setupTimeObserver() {
        guard let player = player else { return }

        let interval = CMTime(seconds: 1.0 / 60.0, preferredTimescale: 600)
        timeObserverToken = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                guard let self = self else { return }
                if self.isPlaying && !self.isAuditioning {
                    let pTime = time.seconds
                    let sTime = self.sequenceTime(from: pTime)
                    self.playhead = sTime
                    self.syncSourcePlayers(to: sTime)
                }
            }
        }
    }
}
