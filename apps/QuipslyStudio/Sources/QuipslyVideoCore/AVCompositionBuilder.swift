import Foundation
import AVFoundation

public enum AVCompositionError: Error {
    case invalidMediaURL(URL)
    case failedToLoadTracks
    case noAudioLanes
    case noAudioSegments
}

public actor AVCompositionBuilder {
    private struct VideoSegment {
        var sourceRange: CMTimeRange
        var destination: CMTime
        var heldOutputDuration: CMTime?
    }

    public init() {}

    public func buildPlayerItem(
        for sequence: MediaSequence,
        mode: PlaybackMode = .playEdit,
        format: ExportFormat = .horizontal16x9,
        allowExternalOriginalMedia: Bool = false,
        allowedOriginalMediaRootPath: String? = nil,
        allowedProxyMediaRootPath: String? = nil,
        sequenceRangeOverride: [ClosedRange<Double>]? = nil
    ) async throws -> AVPlayerItem {
        let composition = AVMutableComposition()

        var layerInstructions: [AVMutableVideoCompositionLayerInstruction] = []
        var layerInstructionsByLaneID: [UUID: AVMutableVideoCompositionLayerInstruction] = [:]
        var compositionVideoTracks: [AVMutableCompositionTrack] = []

        let targetRenderSize: CGSize
        switch format {
        case .horizontal16x9:
            targetRenderSize = CGSize(width: 1920, height: 1080)
        case .vertical9x16:
            targetRenderSize = CGSize(width: 1080, height: 1920)
        }

        // Ensure track order: V1 Base is at the bottom (rendered first), V2 Overlay on top
        // In the UI they might be ordered [V2, V1]. We reverse it here so V1 is processed first,
        // but AVVideoComposition processes instructions in the order they are added to the array.
        // The first instruction in the array is the TOP-MOST layer.
        // So we want V2's instruction first, then V1's instruction.

        let sequenceHasProgramTrack = !sequence.programDecisions.isEmpty
        let sequenceHasActiveTags = sequence.lanes.contains { lane in
            lane.metadata?.ignoreForProduction != true && lane.tags.contains { $0.type == .active }
        }
        let sequenceHasProgramTruth = sequenceHasProgramTrack || sequenceHasActiveTags

        var validRanges: [ClosedRange<Double>] = []
        let minimumRenderableSegmentDuration = 1.0 / 30.0
        if let sequenceRangeOverride {
            validRanges = Self.normalizedRenderableRanges(
                sequenceRangeOverride,
                minimumDuration: minimumRenderableSegmentDuration
            )
        } else if mode == .playThrough {
            validRanges = [0...max(sequence.duration, 0)]
        } else {
            validRanges = Self.normalizedRenderableRanges(
                PlaybackEngine.computeValidRanges(for: sequence),
                minimumDuration: minimumRenderableSegmentDuration
            )
        }
        let compositionDuration = mode == .playThrough
            ? max(sequence.duration, 0)
            : validRanges.reduce(0) { total, range in total + max(0, range.upperBound - range.lowerBound) }

        for lane in sequence.lanes {
            if lane.metadata?.ignoreForProduction == true {
                continue
            }
            if let sourceVideo = lane.sourceVideo {
                let urlToUse: URL
                let rawPath = sourceVideo.mediaURL.path
                let isAudioOnly = Self.isAudioOnlyLane(lane, sourceVideo: sourceVideo)
                if let proxyURL = sourceVideo.proxyURL {
                    if Self.isProtectedOriginalPath(proxyURL.path)
                        && !Self.isOriginalPathAllowed(proxyURL.path, allowedRootPath: allowedProxyMediaRootPath) {
                        continue
                    }
                    guard FileManager.default.fileExists(atPath: proxyURL.path) else {
                        continue
                    }
                    urlToUse = proxyURL
                } else {
                    if !isAudioOnly {
                        continue
                    }
                    if Self.isProtectedOriginalPath(rawPath)
                        && !Self.isOriginalPathAllowed(rawPath, allowedRootPath: allowedOriginalMediaRootPath) {
                        continue
                    }
                    guard FileManager.default.fileExists(atPath: rawPath) else {
                        continue
                    }
                    urlToUse = sourceVideo.mediaURL
                }
                let options: [String: Any]? = urlToUse.pathExtension.lowercased() == "insv" ? ["AVURLAssetOutOfBandMIMETypeKey": "video/mp4"] : nil
                let asset = AVURLAsset(url: urlToUse, options: options)

                do {
                    let sourceVideoTracks = try await asset.loadTracks(withMediaType: .video)
                    let sourceAudioTracks = try await asset.loadTracks(withMediaType: .audio)

                    var currentMediaTime = 0.0
                    var currentTimelineTime = sourceVideo.offset
                    let totalDuration = sourceVideo.duration

                    var segmentSequenceRanges = validRanges
                    if mode == .playEdit && sequenceHasProgramTruth && !isAudioOnly {
                        let visibleRanges = sequenceHasProgramTrack
                            ? sequence.programVisibleRanges(for: lane.id)
                            : lane.tags
                                .filter { $0.type == .active }
                                .map { tag in
                                    let start = tag.startTime + sourceVideo.offset
                                    return start...(start + max(0, tag.duration))
                                }
                        segmentSequenceRanges = visibleRanges.flatMap { visibleRange in
                            validRanges.compactMap { validRange in
                                let start = max(visibleRange.lowerBound, validRange.lowerBound)
                                let end = min(visibleRange.upperBound, validRange.upperBound)
                                return start < end ? start...end : nil
                            }
                        }
                    }
                    segmentSequenceRanges = Self.normalizedRenderableRanges(
                        segmentSequenceRanges,
                        minimumDuration: minimumRenderableSegmentDuration
                    )

                    var segments: [VideoSegment] = []

                    for sequenceRange in segmentSequenceRanges {
                        let mediaStart = max(0, sequenceRange.lowerBound - sourceVideo.offset)
                        let mediaEnd = min(sourceVideo.duration, sequenceRange.upperBound - sourceVideo.offset)

                        if mediaEnd - mediaStart >= minimumRenderableSegmentDuration {
                            let duration = mediaEnd - mediaStart
                            let sequenceStart = mediaStart + sourceVideo.offset
                            let programStart = Self.programTime(for: sequenceStart, in: validRanges)
                            let event = sequence.programDecision(at: sequenceStart + duration / 2)
                            let holdsThisClip = mode == .playEdit
                                && event?.resolvedClipMotion == .holdFrame
                                && event?.clipLaneID == lane.id

                            if holdsThisClip {
                                let frameDuration = min(minimumRenderableSegmentDuration, sourceVideo.duration)
                                let requestedFrame = event?.clipHoldSourceTime ?? mediaStart
                                let heldSourceTime = min(
                                    max(0, requestedFrame),
                                    max(0, sourceVideo.duration - frameDuration)
                                )
                                segments.append(VideoSegment(
                                    sourceRange: CMTimeRange(
                                        start: CMTime(seconds: heldSourceTime, preferredTimescale: 600),
                                        duration: CMTime(seconds: frameDuration, preferredTimescale: 600)
                                    ),
                                    destination: CMTime(seconds: programStart, preferredTimescale: 600),
                                    heldOutputDuration: CMTime(seconds: duration, preferredTimescale: 600)
                                ))
                            } else {
                                segments.append(VideoSegment(
                                    sourceRange: CMTimeRange(
                                        start: CMTime(seconds: mediaStart, preferredTimescale: 600),
                                        duration: CMTime(seconds: duration, preferredTimescale: 600)
                                    ),
                                    destination: CMTime(seconds: programStart, preferredTimescale: 600),
                                    heldOutputDuration: nil
                                ))
                            }
                        }
                    }

                    var audioSequenceRanges: [ClosedRange<Double>]
                    if mode == .playThrough {
                        audioSequenceRanges = isAudioOnly ? validRanges : []
                    } else if sequenceHasProgramTrack {
                        audioSequenceRanges = sequence.programAudioRanges(
                            for: lane.id,
                            isHostMixLane: isAudioOnly
                        ).flatMap { audibleRange in
                            validRanges.compactMap { validRange in
                                let start = max(audibleRange.lowerBound, validRange.lowerBound)
                                let end = min(audibleRange.upperBound, validRange.upperBound)
                                return start < end ? start...end : nil
                            }
                        }
                    } else {
                        audioSequenceRanges = isAudioOnly ? validRanges : []
                    }

                    if !isAudioOnly {
                        audioSequenceRanges = Self.subtractRanges(
                            audioSequenceRanges,
                            removing: sequence.resolvedProgramDecisionSpans().compactMap { span in
                                guard span.event.resolvedClipMotion == .holdFrame,
                                      span.event.clipLaneID == lane.id else { return nil }
                                return span.startTime...span.endTime
                            }
                        )
                    }

                    let normalizedAudioRanges = Self.normalizedRenderableRanges(
                        audioSequenceRanges,
                        minimumDuration: minimumRenderableSegmentDuration
                    )
                    var audioSegments: [(CMTimeRange, CMTime)] = []
                    for sequenceRange in normalizedAudioRanges {
                        let mediaStart = max(0, sequenceRange.lowerBound - sourceVideo.offset)
                        let mediaEnd = min(sourceVideo.duration, sequenceRange.upperBound - sourceVideo.offset)
                        guard mediaEnd - mediaStart >= minimumRenderableSegmentDuration else { continue }

                        let duration = mediaEnd - mediaStart
                        let mediaTimeRange = CMTimeRange(
                            start: CMTime(seconds: mediaStart, preferredTimescale: 600),
                            duration: CMTime(seconds: duration, preferredTimescale: 600)
                        )
                        let sequenceStart = mediaStart + sourceVideo.offset
                        let programStart = Self.programTime(for: sequenceStart, in: validRanges)
                        audioSegments.append((
                            mediaTimeRange,
                            CMTime(seconds: programStart, preferredTimescale: 600)
                        ))
                    }

                    if segments.isEmpty && audioSegments.isEmpty {
                        continue
                    }

                    if !segments.isEmpty, let svTrack = sourceVideoTracks.first {
                        if let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) {
                            for segment in segments {
                                try compVideoTrack.insertTimeRange(
                                    segment.sourceRange,
                                    of: svTrack,
                                    at: segment.destination
                                )
                                if let heldOutputDuration = segment.heldOutputDuration {
                                    compVideoTrack.scaleTimeRange(
                                        CMTimeRange(
                                            start: segment.destination,
                                            duration: segment.sourceRange.duration
                                        ),
                                        toDuration: heldOutputDuration
                                    )
                                }
                            }
                            compositionVideoTracks.append(compVideoTrack)

                            let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideoTrack)
                            let naturalSize = try await svTrack.load(.naturalSize)
                            let preferredTransform = try await svTrack.load(.preferredTransform)
                            let renderTransform = Self.aspectFillTransform(
                                naturalSize: naturalSize,
                                preferredTransform: preferredTransform,
                                renderSize: targetRenderSize
                            )
                            layerInstruction.setTransform(renderTransform, at: .zero)

                            if mode == .playEdit && sequenceHasProgramTruth {
                                layerInstruction.setOpacity(0.0, at: .zero)
                                let activeRanges = Self.resolvedActiveSequenceRanges(
                                    for: lane,
                                    sourceVideo: sourceVideo,
                                    in: sequence
                                )
                                for activeRange in activeRanges {
                                    let tagSeqStart = activeRange.lowerBound
                                    let tagSeqEnd = activeRange.upperBound
                                    let activeVisualLaneIds = Self.activeVisualLaneIDs(
                                        at: (tagSeqStart + tagSeqEnd) / 2,
                                        in: sequence,
                                        allowedProxyMediaRootPath: allowedProxyMediaRootPath
                                    )
                                    let slotFrame = Self.programSlotFrame(
                                        for: lane,
                                        activeLaneIds: activeVisualLaneIds,
                                        in: sequence,
                                        format: format,
                                        renderSize: targetRenderSize
                                    )
                                    let preservesWholeFrame = Self.isClipFocusLane(lane)
                                        && activeVisualLaneIds.count > 1
                                        && Self.clipFocusLayout(for: format, in: sequence).clipContentMode == .fit
                                    let activeClipFocusLayout = Self.isClipFocusLane(lane)
                                        ? Self.clipFocusLayout(for: format, in: sequence)
                                        : nil
                                    let tagCropAdjustment = Self.applyingClipFocus(
                                        activeClipFocusLayout,
                                        to: Self.programCropAdjustment(for: lane, format: format, at: tagSeqStart)
                                    )
                                    let pStart = Self.programTime(for: tagSeqStart, in: validRanges)
                                    let pEnd = Self.programTime(for: tagSeqEnd, in: validRanges)

                                    if pStart < pEnd {
                                        let start = CMTime(seconds: pStart, preferredTimescale: 600)
                                        let end = CMTime(seconds: pEnd, preferredTimescale: 600)

                                        let tagTransform = preservesWholeFrame
                                            ? Self.aspectFitTransform(
                                                naturalSize: naturalSize,
                                                preferredTransform: preferredTransform,
                                                renderFrame: slotFrame,
                                                cropAdjustment: tagCropAdjustment
                                            )
                                            : Self.aspectFillTransform(
                                                naturalSize: naturalSize,
                                                preferredTransform: preferredTransform,
                                                renderFrame: slotFrame,
                                                cropAdjustment: tagCropAdjustment
                                            )
                                        let sourceCropRectangle = preservesWholeFrame
                                            ? CGRect(origin: .zero, size: naturalSize)
                                            : Self.sourceCropRectangleForAspectFill(
                                                naturalSize: naturalSize,
                                                preferredTransform: preferredTransform,
                                                renderFrame: slotFrame,
                                                cropAdjustment: tagCropAdjustment
                                            )
                                        layerInstruction.setCropRectangle(sourceCropRectangle, at: start)
                                        layerInstruction.setTransform(tagTransform, at: start)
                                        Self.applyProgramCropKeyframes(
                                            to: layerInstruction,
                                            lane: lane,
                                            format: format,
                                            naturalSize: naturalSize,
                                            preferredTransform: preferredTransform,
                                            renderFrame: slotFrame,
                                            sequenceStart: tagSeqStart,
                                            sequenceEnd: tagSeqEnd,
                                            validRanges: validRanges,
                                            preservesWholeFrame: preservesWholeFrame,
                                            clipFocusLayout: activeClipFocusLayout
                                        )
                                        layerInstruction.setOpacity(1.0, at: start)
                                        layerInstruction.setOpacity(0.0, at: end)
                                    }
                                }
                            }

                            layerInstructions.append(layerInstruction)
                            layerInstructionsByLaneID[lane.id] = layerInstruction
                        }
                    }

                    if !audioSegments.isEmpty, let saTrack = sourceAudioTracks.first {
                        if let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
                            for segment in audioSegments {
                                try compAudioTrack.insertTimeRange(segment.0, of: saTrack, at: segment.1)
                            }
                        }
                    }

                } catch {
                    print("Failed to load asset for lane: \(lane.id), error: \(error)")
                }
            }
        }

        let playerItem = AVPlayerItem(asset: composition)

        if !compositionVideoTracks.isEmpty {
            let videoComposition = AVMutableVideoComposition()
            videoComposition.renderSize = targetRenderSize
            videoComposition.frameDuration = CMTime(value: 1, timescale: 30) // 30 FPS

            let instructions: [AVVideoCompositionInstructionProtocol]

            let activeTrack = format == .vertical9x16 ? sequence.verticalOrientationTrack : sequence.orientationTrack

            let shouldUseReframingCompositor = sequence.lanes.contains { lane in
                guard lane.metadata?.ignoreForProduction != true else { return false }
                return lane.sourceVideo?.is360 == true
            }

            if shouldUseReframingCompositor,
               !activeTrack.keyframes.isEmpty,
               let baseTrack = compositionVideoTracks.first {
                videoComposition.customVideoCompositorClass = ReframingCompositor.self
                let reframingInstruction = ReframingCompositionInstruction(
                    timeRange: CMTimeRange(start: .zero, duration: CMTime(seconds: compositionDuration, preferredTimescale: 600)),
                    sourceTrackID: baseTrack.trackID,
                    keyframes: activeTrack.keyframes,
                    is360: true
                )
                instructions = [reframingInstruction]
            } else if mode == .playEdit && sequenceHasProgramTruth {
                let compiledInstructions = Self.compactProgramInstructions(
                    for: sequence,
                    validRanges: validRanges,
                    layerInstructionsByLaneID: layerInstructionsByLaneID,
                    allowedProxyMediaRootPath: allowedProxyMediaRootPath
                )
                if compiledInstructions.isEmpty {
                    let fallbackInstruction = AVMutableVideoCompositionInstruction()
                    fallbackInstruction.timeRange = CMTimeRange(
                        start: .zero,
                        duration: CMTime(seconds: compositionDuration, preferredTimescale: 600)
                    )
                    fallbackInstruction.layerInstructions = layerInstructions
                    instructions = [fallbackInstruction]
                } else {
                    instructions = compiledInstructions
                }
            } else {
                let standardInstruction = AVMutableVideoCompositionInstruction()
                standardInstruction.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: compositionDuration, preferredTimescale: 600))
                standardInstruction.layerInstructions = layerInstructions
                instructions = [standardInstruction]
            }

            videoComposition.instructions = instructions
            playerItem.videoComposition = videoComposition
        }

        return playerItem
    }

    /// Compiles sparse editorial intent into small AVFoundation render spans.
    ///
    /// The sequence model intentionally keeps every whole source lane. Program
    /// playback should not make AVFoundation preroll every one of those lanes at
    /// once, however. Each instruction below names only the one to three visual
    /// sources required for that part of the edit. Adjacent spans with identical
    /// source ownership are merged so the playback graph stays compact.
    private static func compactProgramInstructions(
        for sequence: MediaSequence,
        validRanges: [ClosedRange<Double>],
        layerInstructionsByLaneID: [UUID: AVMutableVideoCompositionLayerInstruction],
        allowedProxyMediaRootPath: String?
    ) -> [AVVideoCompositionInstructionProtocol] {
        guard !validRanges.isEmpty, !layerInstructionsByLaneID.isEmpty else { return [] }

        var boundaries = validRanges.flatMap { [$0.lowerBound, $0.upperBound] }
        boundaries.append(contentsOf: sequence.sortedProgramDecisions.map(\.startTime))

        for lane in sequence.lanes {
            guard lane.metadata?.ignoreForProduction != true,
                  let sourceVideo = lane.sourceVideo,
                  !isAudioOnlyLane(lane, sourceVideo: sourceVideo) else { continue }
            boundaries.append(sourceVideo.offset)
            boundaries.append(sourceVideo.offset + sourceVideo.duration)

            if sequence.programDecisions.isEmpty {
                for tag in lane.tags where tag.duration > 0 {
                    boundaries.append(sourceVideo.offset + tag.startTime)
                    boundaries.append(sourceVideo.offset + tag.startTime + tag.duration)
                }
            }
        }

        let finiteBoundaries = Array(Set(boundaries.filter(\.isFinite))).sorted()
        var compiled: [AVMutableVideoCompositionInstruction] = []
        var previousLaneIDs: [UUID]?

        for validRange in validRanges {
            let localBoundaries = Array(Set(
                [validRange.lowerBound, validRange.upperBound]
                + finiteBoundaries.filter { $0 > validRange.lowerBound && $0 < validRange.upperBound }
            )).sorted()

            guard localBoundaries.count > 1 else { continue }
            for index in 0..<(localBoundaries.count - 1) {
                let sequenceStart = localBoundaries[index]
                let sequenceEnd = localBoundaries[index + 1]
                guard sequenceEnd - sequenceStart >= 1.0 / 600.0 else { continue }

                let midpoint = sequenceStart + ((sequenceEnd - sequenceStart) / 2)
                let activeLaneIDs = activeVisualLaneIDs(
                    at: midpoint,
                    in: sequence,
                    allowedProxyMediaRootPath: allowedProxyMediaRootPath
                ).filter { layerInstructionsByLaneID[$0] != nil }

                let programStart = programTime(for: sequenceStart, in: validRanges)
                let programEnd = programTime(for: sequenceEnd, in: validRanges)
                guard programEnd - programStart >= 1.0 / 600.0 else { continue }

                if let previous = compiled.last,
                   previousLaneIDs == activeLaneIDs,
                   abs(previous.timeRange.end.seconds - programStart) <= 1.0 / 600.0 {
                    previous.timeRange = CMTimeRange(
                        start: previous.timeRange.start,
                        end: CMTime(seconds: programEnd, preferredTimescale: 600)
                    )
                    continue
                }

                let instruction = AVMutableVideoCompositionInstruction()
                instruction.timeRange = CMTimeRange(
                    start: CMTime(seconds: programStart, preferredTimescale: 600),
                    end: CMTime(seconds: programEnd, preferredTimescale: 600)
                )
                instruction.layerInstructions = activeLaneIDs.compactMap { layerInstructionsByLaneID[$0] }
                compiled.append(instruction)
                previousLaneIDs = activeLaneIDs
            }
        }

        return compiled
    }

    public func buildAudioMasterComposition(
        for sequence: MediaSequence,
        mode: PlaybackMode = .playEdit,
        allowExternalOriginalMedia: Bool = false,
        allowedOriginalMediaRootPath: String? = nil
    ) async throws -> AVMutableComposition {
        let composition = AVMutableComposition()
        let validRanges: [ClosedRange<Double>]
        if mode == .playThrough {
            validRanges = [0...max(sequence.duration, 0)]
        } else {
            validRanges = PlaybackEngine.computeValidRanges(for: sequence)
        }

        guard !validRanges.isEmpty else {
            throw AVCompositionError.noAudioSegments
        }

        let sequenceHasProgramTrack = !sequence.programDecisions.isEmpty
        let audioLanes = sequence.lanes.filter { lane in
            lane.metadata?.ignoreForProduction != true && lane.sourceVideo != nil
        }
        guard !audioLanes.isEmpty else {
            throw AVCompositionError.noAudioLanes
        }

        var insertedSegmentCount = 0
        for lane in audioLanes {
            guard let sourceVideo = lane.sourceVideo else { continue }

            let urlToUse: URL
            let rawPath = sourceVideo.mediaURL.path
            if let proxyURL = sourceVideo.proxyURL {
                if Self.isProtectedOriginalPath(proxyURL.path)
                    && !Self.isOriginalPathAllowed(proxyURL.path, allowedRootPath: allowedOriginalMediaRootPath) {
                    continue
                }
                guard FileManager.default.fileExists(atPath: proxyURL.path) else {
                    continue
                }
                urlToUse = proxyURL
            } else {
                if Self.isProtectedOriginalPath(rawPath)
                    && !Self.isOriginalPathAllowed(rawPath, allowedRootPath: allowedOriginalMediaRootPath) {
                    continue
                }
                guard FileManager.default.fileExists(atPath: rawPath) else {
                    continue
                }
                urlToUse = sourceVideo.mediaURL
            }

            let asset = AVURLAsset(url: urlToUse)
            let sourceAudioTracks = try await asset.loadTracks(withMediaType: .audio)
            guard let sourceAudioTrack = sourceAudioTracks.first else { continue }
            let isHostMixLane = Self.isAudioOnlyLane(lane, sourceVideo: sourceVideo)

            var audioSequenceRanges: [ClosedRange<Double>]
            if mode == .playThrough {
                audioSequenceRanges = isHostMixLane ? validRanges : []
            } else if sequenceHasProgramTrack {
                audioSequenceRanges = sequence.programAudioRanges(
                    for: lane.id,
                    isHostMixLane: isHostMixLane
                ).flatMap { audibleRange in
                    validRanges.compactMap { validRange in
                        let start = max(audibleRange.lowerBound, validRange.lowerBound)
                        let end = min(audibleRange.upperBound, validRange.upperBound)
                        return start < end ? start...end : nil
                    }
                }
            } else {
                audioSequenceRanges = isHostMixLane ? validRanges : []
            }

            if !isHostMixLane {
                audioSequenceRanges = Self.subtractRanges(
                    audioSequenceRanges,
                    removing: sequence.resolvedProgramDecisionSpans().compactMap { span in
                        guard span.event.resolvedClipMotion == .holdFrame,
                              span.event.clipLaneID == lane.id else { return nil }
                        return span.startTime...span.endTime
                    }
                )
            }

            let normalizedAudioRanges = Self.normalizedRenderableRanges(
                audioSequenceRanges,
                minimumDuration: 1.0 / 30.0
            )
            guard !normalizedAudioRanges.isEmpty else { continue }
            guard let compAudioTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else { continue }

            for audibleRange in normalizedAudioRanges {
                let mediaStart = max(0, audibleRange.lowerBound - sourceVideo.offset)
                let mediaEnd = min(sourceVideo.duration, audibleRange.upperBound - sourceVideo.offset)
                guard mediaStart < mediaEnd else { continue }

                let duration = mediaEnd - mediaStart
                let mediaTimeRange = CMTimeRange(
                    start: CMTime(seconds: mediaStart, preferredTimescale: 600),
                    duration: CMTime(seconds: duration, preferredTimescale: 600)
                )
                let sequenceStart = mediaStart + sourceVideo.offset
                let programStart = Self.programTime(for: sequenceStart, in: validRanges)

                try compAudioTrack.insertTimeRange(
                    mediaTimeRange,
                    of: sourceAudioTrack,
                    at: CMTime(seconds: programStart, preferredTimescale: 600)
                )
                insertedSegmentCount += 1
            }
        }

        guard insertedSegmentCount > 0 else {
            throw AVCompositionError.noAudioSegments
        }

        return composition
    }

    private static func isAudioOnlyLane(_ lane: VideoLane, sourceVideo: SourceVideo) -> Bool {
        let kind = lane.metadata?.mediaKind.lowercased() ?? ""
        if kind == "audio" {
            return true
        }
        let ext = sourceVideo.mediaURL.pathExtension.lowercased()
        return ["wav", "aif", "aiff", "mp3", "m4a", "aac", "flac"].contains(ext)
    }

    private static func subtractRanges(
        _ ranges: [ClosedRange<Double>],
        removing cuts: [ClosedRange<Double>]
    ) -> [ClosedRange<Double>] {
        guard !ranges.isEmpty, !cuts.isEmpty else { return ranges }
        let sortedCuts = cuts.sorted { $0.lowerBound < $1.lowerBound }

        return ranges.flatMap { range -> [ClosedRange<Double>] in
            var remaining = [range]
            for cut in sortedCuts {
                remaining = remaining.flatMap { candidate -> [ClosedRange<Double>] in
                    let overlapStart = max(candidate.lowerBound, cut.lowerBound)
                    let overlapEnd = min(candidate.upperBound, cut.upperBound)
                    guard overlapStart < overlapEnd else { return [candidate] }

                    var pieces: [ClosedRange<Double>] = []
                    if candidate.lowerBound < overlapStart {
                        pieces.append(candidate.lowerBound...overlapStart)
                    }
                    if overlapEnd < candidate.upperBound {
                        pieces.append(overlapEnd...candidate.upperBound)
                    }
                    return pieces
                }
            }
            return remaining
        }
    }

    private static func isProtectedOriginalPath(_ path: String) -> Bool {
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

    private static func isOriginalPathAllowed(_ path: String, allowedRootPath: String?) -> Bool {
        guard let allowedRootPath, !allowedRootPath.isEmpty else {
            return false
        }
        let root = URL(fileURLWithPath: allowedRootPath, isDirectory: true).standardizedFileURL.path
        let original = URL(fileURLWithPath: path).standardizedFileURL.path
        return original == root || original.hasPrefix(root + "/")
    }

    private static func programTime(for sequenceTime: Double, in validRanges: [ClosedRange<Double>]) -> Double {
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

    private static func normalizedRenderableRanges(
        _ ranges: [ClosedRange<Double>],
        minimumDuration: Double
    ) -> [ClosedRange<Double>] {
        let sorted = ranges
            .filter {
                $0.lowerBound.isFinite
                && $0.upperBound.isFinite
                && $0.upperBound - $0.lowerBound >= minimumDuration
            }
            .sorted { $0.lowerBound < $1.lowerBound }

        guard !sorted.isEmpty else { return [] }

        var merged: [ClosedRange<Double>] = []
        for range in sorted {
            guard let last = merged.last else {
                merged.append(range)
                continue
            }

            if range.lowerBound - last.upperBound < minimumDuration {
                merged[merged.count - 1] = last.lowerBound...max(last.upperBound, range.upperBound)
            } else {
                merged.append(range)
            }
        }
        return merged
    }

    private static func activeVisualLaneIDs(
        at sequenceTime: Double,
        in sequence: MediaSequence,
        allowedProxyMediaRootPath: String?
    ) -> [UUID] {
        if let event = sequence.programDecision(at: sequenceTime) {
            let selectedIDs = Set(event.sourceLaneIDs)
            return sequence.lanes
                .filter { lane in
                    guard selectedIDs.contains(lane.id),
                          lane.metadata?.ignoreForProduction != true,
                          let sourceVideo = lane.sourceVideo else { return false }
                    guard sequenceTime >= sourceVideo.offset,
                          sequenceTime < sourceVideo.offset + sourceVideo.duration else { return false }
                    return isPlayableVisualLane(
                        lane,
                        sourceVideo: sourceVideo,
                        allowedProxyMediaRootPath: allowedProxyMediaRootPath
                    )
                }
                .sorted { programLaneSortKey($0) < programLaneSortKey($1) }
                .map(\.id)
        }

        return sequence.lanes
            .filter { lane in
                guard lane.metadata?.ignoreForProduction != true else { return false }
                guard let sourceVideo = lane.sourceVideo else { return false }
                guard isPlayableVisualLane(
                    lane,
                    sourceVideo: sourceVideo,
                    allowedProxyMediaRootPath: allowedProxyMediaRootPath
                ) else { return false }
                let localTime = sequenceTime - sourceVideo.offset
                return effectiveDecision(in: lane, at: localTime)?.type == .active
            }
            .sorted { lhs, rhs in
                programLaneSortKey(lhs) < programLaneSortKey(rhs)
            }
            .map(\.id)
    }

    private static func effectiveDecision(in lane: VideoLane, at localTime: Double) -> VideoTag? {
        lane.tags.last { tag in
            localTime >= tag.startTime &&
            localTime < tag.startTime + max(0, tag.duration)
        }
    }

    private static func resolvedActiveSequenceRanges(
        for lane: VideoLane,
        sourceVideo: SourceVideo,
        in sequence: MediaSequence
    ) -> [ClosedRange<Double>] {
        if !sequence.programDecisions.isEmpty {
            let sourceStart = sourceVideo.offset
            let sourceEnd = sourceVideo.offset + sourceVideo.duration
            return sequence.programVisibleRanges(for: lane.id).compactMap { range in
                let start = max(sourceStart, range.lowerBound)
                let end = min(sourceEnd, range.upperBound)
                return start < end ? start...end : nil
            }
        }

        let sourceStart = sourceVideo.offset
        let sourceEnd = sourceVideo.offset + sourceVideo.duration
        var boundaries = [sourceStart, sourceEnd]

        for tag in lane.tags where tag.duration > 0 {
            let start = min(max(sourceStart + tag.startTime, sourceStart), sourceEnd)
            let end = min(max(start + tag.duration, sourceStart), sourceEnd)
            boundaries.append(start)
            boundaries.append(end)
        }

        let sorted = Array(Set(boundaries)).sorted()
        guard sorted.count > 1 else { return [] }

        var activeRanges: [ClosedRange<Double>] = []
        for index in 0..<(sorted.count - 1) {
            let start = sorted[index]
            let end = sorted[index + 1]
            guard end > start else { continue }
            let midpoint = ((start + end) / 2) - sourceStart
            guard effectiveDecision(in: lane, at: midpoint)?.type == .active else { continue }
            activeRanges.append(start...end)
        }

        var merged: [ClosedRange<Double>] = []
        for range in activeRanges {
            if let last = merged.last, last.upperBound >= range.lowerBound {
                merged[merged.count - 1] = last.lowerBound...max(last.upperBound, range.upperBound)
            } else {
                merged.append(range)
            }
        }
        return merged
    }

    private static func isPlayableVisualLane(
        _ lane: VideoLane,
        sourceVideo: SourceVideo,
        allowedProxyMediaRootPath: String?
    ) -> Bool {
        guard lane.metadata?.ignoreForProduction != true else { return false }
        guard !isAudioOnlyLane(lane, sourceVideo: sourceVideo) else { return false }
        let rawPath = sourceVideo.mediaURL.path
        if rawPath.contains("__quipsly_missing_media__") || lane.metadata?.declaredExists == false {
            return false
        }
        guard let proxyURL = sourceVideo.proxyURL else {
            return false
        }
        if isProtectedOriginalPath(proxyURL.path)
            && !isOriginalPathAllowed(proxyURL.path, allowedRootPath: allowedProxyMediaRootPath) {
            return false
        }
        return FileManager.default.fileExists(atPath: proxyURL.path)
    }

    private static func programLaneSortKey(_ lane: VideoLane) -> String {
        let role = (lane.metadata?.role ?? "").lowercased()
        let name = lane.name.lowercased()
        if role.contains("charlie") || name.contains("charlie") {
            return "00-charlie-\(lane.name)"
        }
        if role.contains("homer") || name.contains("homer") {
            return "01-homer-\(lane.name)"
        }
        if role.contains("clip") || name.contains("clip") || name.contains("reference") {
            return "02-clip-\(lane.name)"
        }
        return "99-\(lane.name)"
    }

    private static func programSlotFrame(
        for lane: VideoLane,
        activeLaneIds: [UUID],
        in sequence: MediaSequence,
        format: ExportFormat,
        renderSize: CGSize
    ) -> CGRect {
        guard activeLaneIds.count > 1,
              let index = activeLaneIds.firstIndex(of: lane.id) else {
            return CGRect(origin: .zero, size: renderSize)
        }

        let activeLanes = activeLaneIds.compactMap { id in
            sequence.lanes.first(where: { $0.id == id })
        }
        let clipLanes = activeLanes.filter(isClipFocusLane)
        let hostLanes = activeLanes.filter { !isClipFocusLane($0) }

        if !clipLanes.isEmpty, !hostLanes.isEmpty {
            let gap = max(8, min(renderSize.width, renderSize.height) * 0.012)
            let isClip = isClipFocusLane(lane)
            let layout = clipFocusLayout(for: format, in: sequence)
            let reactionFraction = CGFloat(layout.reactionSize)

            if layout.placement == .cornerSquares {
                if isClip {
                    return CGRect(origin: .zero, size: renderSize)
                }
                guard let hostIndex = hostLanes.firstIndex(where: { $0.id == lane.id }) else { return .zero }
                let inset = max(12, min(renderSize.width, renderSize.height) * 0.025)
                let squareSide = max(1, min(renderSize.width, renderSize.height) * reactionFraction)
                let x = hostIndex.isMultiple(of: 2)
                    ? inset
                    : max(inset, renderSize.width - squareSide - inset)
                return CGRect(
                    x: x,
                    y: max(inset, renderSize.height - squareSide - inset),
                    width: squareSide,
                    height: squareSide
                )
            }

            if layout.placement == .hostWings {
                switch format {
                case .horizontal16x9:
                    let hostWidth = max(1, renderSize.width * reactionFraction)
                    let clipWidth = max(1, renderSize.width - (hostWidth * 2) - (gap * 2))
                    if isClip {
                        let clipHeight = max(1, renderSize.height * 0.64)
                        return CGRect(
                            x: hostWidth + gap,
                            y: (renderSize.height - clipHeight) / 2,
                            width: clipWidth,
                            height: clipHeight
                        )
                    }
                    guard let hostIndex = hostLanes.firstIndex(where: { $0.id == lane.id }) else { return .zero }
                    let x = hostIndex.isMultiple(of: 2)
                        ? 0
                        : max(0, renderSize.width - hostWidth)
                    return CGRect(x: x, y: 0, width: hostWidth, height: renderSize.height)

                case .vertical9x16:
                    let reactionHeight = max(1, renderSize.height * reactionFraction)
                    let clipHeight = max(1, renderSize.height - reactionHeight - gap)
                    if isClip {
                        return CGRect(x: 0, y: reactionHeight + gap, width: renderSize.width, height: clipHeight)
                    }
                    guard let hostIndex = hostLanes.firstIndex(where: { $0.id == lane.id }) else { return .zero }
                    let hostWidth = max(1, (renderSize.width - (gap * CGFloat(max(0, hostLanes.count - 1)))) / CGFloat(hostLanes.count))
                    return CGRect(
                        x: CGFloat(hostIndex) * (hostWidth + gap),
                        y: 0,
                        width: hostWidth,
                        height: reactionHeight
                    )
                }
            }

            if layout.placement == .clipAbove {
                let reactionHeight = max(1, renderSize.height * reactionFraction)
                let clipHeight = max(1, renderSize.height - reactionHeight - gap)
                if isClip {
                    return CGRect(x: 0, y: 0, width: renderSize.width, height: clipHeight)
                }
                guard let hostIndex = hostLanes.firstIndex(where: { $0.id == lane.id }) else { return .zero }
                let hostWidth = max(1, (renderSize.width - (gap * CGFloat(max(0, hostLanes.count - 1)))) / CGFloat(hostLanes.count))
                return CGRect(
                    x: CGFloat(hostIndex) * (hostWidth + gap),
                    y: clipHeight + gap,
                    width: hostWidth,
                    height: reactionHeight
                )
            }

            switch format {
            case .horizontal16x9:
                let reactionWidth = renderSize.width * reactionFraction
                if isClip {
                    return CGRect(
                        x: reactionWidth + gap,
                        y: 0,
                        width: max(1, renderSize.width - reactionWidth - gap),
                        height: renderSize.height
                    )
                }
                guard let hostIndex = hostLanes.firstIndex(where: { $0.id == lane.id }) else { return .zero }
                let hostHeight = max(1, (renderSize.height - (gap * CGFloat(max(0, hostLanes.count - 1)))) / CGFloat(hostLanes.count))
                let y = renderSize.height - (CGFloat(hostIndex + 1) * hostHeight) - (CGFloat(hostIndex) * gap)
                return CGRect(x: 0, y: max(0, y), width: reactionWidth, height: hostHeight)

            case .vertical9x16:
                let reactionWidth = renderSize.width * reactionFraction
                if isClip {
                    return CGRect(
                        x: reactionWidth + gap,
                        y: 0,
                        width: max(1, renderSize.width - reactionWidth - gap),
                        height: renderSize.height
                    )
                }
                guard let hostIndex = hostLanes.firstIndex(where: { $0.id == lane.id }) else { return .zero }
                let hostHeight = max(1, (renderSize.height - (gap * CGFloat(max(0, hostLanes.count - 1)))) / CGFloat(hostLanes.count))
                let y = renderSize.height - (CGFloat(hostIndex + 1) * hostHeight) - (CGFloat(hostIndex) * gap)
                return CGRect(x: 0, y: max(0, y), width: reactionWidth, height: hostHeight)
            }
        }

        let count = max(1, activeLaneIds.count)
        switch format {
        case .horizontal16x9:
            let width = renderSize.width / CGFloat(count)
            return CGRect(
                x: CGFloat(index) * width,
                y: 0,
                width: width,
                height: renderSize.height
            )
        case .vertical9x16:
            let height = renderSize.height / CGFloat(count)
            return CGRect(
                x: 0,
                y: renderSize.height - (CGFloat(index + 1) * height),
                width: renderSize.width,
                height: height
            )
        }
    }

    private static func isClipFocusLane(_ lane: VideoLane) -> Bool {
        let role = (lane.metadata?.role ?? "").lowercased()
        let kind = (lane.metadata?.mediaKind ?? "").lowercased()
        let name = lane.name.lowercased()
        return role.contains("clip") || role.contains("reference") || kind.contains("clip") || name.contains("clip") || name.contains("reference")
    }

    private static func clipFocusLayout(for format: ExportFormat, in sequence: MediaSequence) -> ClipFocusLayoutSettings {
        switch format {
        case .horizontal16x9:
            return sequence.clipFocusLayout16x9.normalized()
        case .vertical9x16:
            return sequence.clipFocusLayout9x16.normalized()
        }
    }

    private static func programCropAdjustment(for lane: VideoLane, format: ExportFormat, at sequenceTime: Double? = nil) -> ProgramCropAdjustment {
        let baseline: ProgramCropAdjustment
        let keyframes: [ProgramCropKeyframe]
        switch format {
        case .horizontal16x9:
            baseline = lane.metadata?.programCrop16x9 ?? ProgramCropAdjustment()
            keyframes = lane.metadata?.programCropKeyframes16x9 ?? []
        case .vertical9x16:
            baseline = lane.metadata?.programCrop9x16 ?? ProgramCropAdjustment()
            keyframes = lane.metadata?.programCropKeyframes9x16 ?? []
        }
        guard let sequenceTime else { return baseline }
        return interpolatedProgramCrop(baseline: baseline, keyframes: keyframes, at: sequenceTime)
    }

    private static func applyingClipFocus(
        _ layout: ClipFocusLayoutSettings?,
        to cropAdjustment: ProgramCropAdjustment
    ) -> ProgramCropAdjustment {
        guard let layout else { return cropAdjustment }
        var focused = cropAdjustment
        // A focal point describes the source area to retain, while pan describes
        // image motion. Moving focus right therefore translates the image left.
        focused.panX = min(1, max(-1, focused.panX - layout.focusX))
        focused.panY = min(1, max(-1, focused.panY - layout.focusY))
        return focused
    }

    private static func applyProgramCropKeyframes(
        to layerInstruction: AVMutableVideoCompositionLayerInstruction,
        lane: VideoLane,
        format: ExportFormat,
        naturalSize: CGSize,
        preferredTransform: CGAffineTransform,
        renderFrame: CGRect,
        sequenceStart: Double,
        sequenceEnd: Double,
        validRanges: [ClosedRange<Double>],
        preservesWholeFrame: Bool = false,
        clipFocusLayout: ClipFocusLayoutSettings? = nil
    ) {
        let keyframes: [ProgramCropKeyframe]
        switch format {
        case .horizontal16x9:
            keyframes = lane.metadata?.programCropKeyframes16x9 ?? []
        case .vertical9x16:
            keyframes = lane.metadata?.programCropKeyframes9x16 ?? []
        }
        guard !keyframes.isEmpty else { return }

        let times = ([sequenceStart, sequenceEnd] + keyframes.map(\.time).filter { $0 > sequenceStart && $0 < sequenceEnd })
            .filter { $0.isFinite }
            .sorted()
        guard times.count >= 2 else { return }

        for index in 0..<(times.count - 1) {
            let startSequenceTime = times[index]
            let endSequenceTime = times[index + 1]
            let startProgramTime = Self.programTime(for: startSequenceTime, in: validRanges)
            let endProgramTime = Self.programTime(for: endSequenceTime, in: validRanges)
            guard startProgramTime < endProgramTime else { continue }

            let startCrop = Self.applyingClipFocus(
                clipFocusLayout,
                to: Self.programCropAdjustment(for: lane, format: format, at: startSequenceTime)
            )
            let endCrop = Self.applyingClipFocus(
                clipFocusLayout,
                to: Self.programCropAdjustment(for: lane, format: format, at: endSequenceTime)
            )
            let startTransform = preservesWholeFrame
                ? Self.aspectFitTransform(naturalSize: naturalSize, preferredTransform: preferredTransform, renderFrame: renderFrame, cropAdjustment: startCrop)
                : Self.aspectFillTransform(naturalSize: naturalSize, preferredTransform: preferredTransform, renderFrame: renderFrame, cropAdjustment: startCrop)
            let endTransform = preservesWholeFrame
                ? Self.aspectFitTransform(naturalSize: naturalSize, preferredTransform: preferredTransform, renderFrame: renderFrame, cropAdjustment: endCrop)
                : Self.aspectFillTransform(naturalSize: naturalSize, preferredTransform: preferredTransform, renderFrame: renderFrame, cropAdjustment: endCrop)
            layerInstruction.setTransformRamp(
                fromStart: startTransform,
                toEnd: endTransform,
                timeRange: CMTimeRange(
                    start: CMTime(seconds: startProgramTime, preferredTimescale: 600),
                    end: CMTime(seconds: endProgramTime, preferredTimescale: 600)
                )
            )
        }
    }

    private static func interpolatedProgramCrop(
        baseline: ProgramCropAdjustment,
        keyframes: [ProgramCropKeyframe],
        at sequenceTime: Double
    ) -> ProgramCropAdjustment {
        ProgramCropAdjustment.interpolated(baseline: baseline, keyframes: keyframes, at: sequenceTime)
    }

    private static func aspectFillTransform(
        naturalSize: CGSize,
        preferredTransform: CGAffineTransform,
        renderSize: CGSize
    ) -> CGAffineTransform {
        aspectFillTransform(
            naturalSize: naturalSize,
            preferredTransform: preferredTransform,
            renderFrame: CGRect(origin: .zero, size: renderSize)
        )
    }

    private static func aspectFillTransform(
        naturalSize: CGSize,
        preferredTransform: CGAffineTransform,
        renderFrame: CGRect,
        cropAdjustment: ProgramCropAdjustment = ProgramCropAdjustment()
    ) -> CGAffineTransform {
        let naturalRect = CGRect(origin: .zero, size: naturalSize)
        let transformedRect = naturalRect.applying(preferredTransform)
        let displaySize = CGSize(width: abs(transformedRect.width), height: abs(transformedRect.height))

        guard displaySize.width > 0, displaySize.height > 0 else {
            return .identity
        }

        let normalize = CGAffineTransform(
            translationX: -transformedRect.minX,
            y: -transformedRect.minY
        )
        let scale = max(renderFrame.width / displaySize.width, renderFrame.height / displaySize.height) * CGFloat(cropAdjustment.zoom)
        let scaledSize = CGSize(width: displaySize.width * scale, height: displaySize.height * scale)
        let overflowX = max(0, scaledSize.width - renderFrame.width) / 2
        let overflowY = max(0, scaledSize.height - renderFrame.height) / 2
        let center = CGAffineTransform(
            translationX: renderFrame.minX + ((renderFrame.width - scaledSize.width) / 2) + (CGFloat(cropAdjustment.panX) * overflowX),
            y: renderFrame.minY + ((renderFrame.height - scaledSize.height) / 2) + (CGFloat(cropAdjustment.panY) * overflowY)
        )

        return preferredTransform
            .concatenating(normalize)
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(center)
    }

    private static func aspectFitTransform(
        naturalSize: CGSize,
        preferredTransform: CGAffineTransform,
        renderFrame: CGRect,
        cropAdjustment: ProgramCropAdjustment = ProgramCropAdjustment()
    ) -> CGAffineTransform {
        let naturalRect = CGRect(origin: .zero, size: naturalSize)
        let transformedRect = naturalRect.applying(preferredTransform)
        let displaySize = CGSize(width: abs(transformedRect.width), height: abs(transformedRect.height))
        guard displaySize.width > 0, displaySize.height > 0 else { return .identity }

        let normalize = CGAffineTransform(translationX: -transformedRect.minX, y: -transformedRect.minY)
        let fitScale = min(renderFrame.width / displaySize.width, renderFrame.height / displaySize.height)
        let scale = fitScale * CGFloat(max(0.1, cropAdjustment.zoom))
        let scaledSize = CGSize(width: displaySize.width * scale, height: displaySize.height * scale)
        let overflowX = max(0, scaledSize.width - renderFrame.width) / 2
        let overflowY = max(0, scaledSize.height - renderFrame.height) / 2
        let center = CGAffineTransform(
            translationX: renderFrame.minX + ((renderFrame.width - scaledSize.width) / 2) + (CGFloat(cropAdjustment.panX) * overflowX),
            y: renderFrame.minY + ((renderFrame.height - scaledSize.height) / 2) + (CGFloat(cropAdjustment.panY) * overflowY)
        )

        return preferredTransform
            .concatenating(normalize)
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(center)
    }

    private static func sourceCropRectangleForAspectFill(
        naturalSize: CGSize,
        preferredTransform: CGAffineTransform,
        renderFrame: CGRect,
        cropAdjustment: ProgramCropAdjustment = ProgramCropAdjustment()
    ) -> CGRect {
        let naturalRect = CGRect(origin: .zero, size: naturalSize)
        guard naturalSize.width > 0,
              naturalSize.height > 0,
              renderFrame.width > 0,
              renderFrame.height > 0 else {
            return naturalRect
        }

        let transformedRect = naturalRect.applying(preferredTransform)
        let displaySize = CGSize(width: abs(transformedRect.width), height: abs(transformedRect.height))
        guard displaySize.width > 0, displaySize.height > 0 else { return naturalRect }

        let normalizedDisplayTransform = preferredTransform.concatenating(
            CGAffineTransform(translationX: -transformedRect.minX, y: -transformedRect.minY)
        )
        let determinant = (normalizedDisplayTransform.a * normalizedDisplayTransform.d)
            - (normalizedDisplayTransform.b * normalizedDisplayTransform.c)
        guard abs(determinant) > .ulpOfOne else { return naturalRect }

        let targetAspect = renderFrame.width / renderFrame.height
        let displayAspect = displaySize.width / displaySize.height
        let zoom = CGFloat(max(0.1, cropAdjustment.zoom))
        let cropSize: CGSize
        if displayAspect > targetAspect {
            cropSize = CGSize(
                width: min(displaySize.width, (displaySize.height * targetAspect) / zoom),
                height: min(displaySize.height, displaySize.height / zoom)
            )
        } else {
            cropSize = CGSize(
                width: min(displaySize.width, displaySize.width / zoom),
                height: min(displaySize.height, (displaySize.width / targetAspect) / zoom)
            )
        }

        let travelX = max(0, displaySize.width - cropSize.width) / 2
        let travelY = max(0, displaySize.height - cropSize.height) / 2
        let displayCrop = CGRect(
            x: ((displaySize.width - cropSize.width) / 2) - (CGFloat(cropAdjustment.panX) * travelX),
            y: ((displaySize.height - cropSize.height) / 2) - (CGFloat(cropAdjustment.panY) * travelY),
            width: cropSize.width,
            height: cropSize.height
        )

        let sourceCrop = displayCrop
            .applying(normalizedDisplayTransform.inverted())
            .standardized
            .intersection(naturalRect)
        guard !sourceCrop.isNull, sourceCrop.width > 0, sourceCrop.height > 0 else {
            return naturalRect
        }
        return sourceCrop.integral
    }
}
