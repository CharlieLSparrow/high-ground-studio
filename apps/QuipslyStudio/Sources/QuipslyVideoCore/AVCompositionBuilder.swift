import Foundation
import AVFoundation

public enum AVCompositionError: Error {
    case invalidMediaURL(URL)
    case failedToLoadTracks
    case noAudioLanes
    case noAudioSegments
}

public actor AVCompositionBuilder {
    public init() {}

    public func buildPlayerItem(
        for sequence: MediaSequence,
        mode: PlaybackMode = .playEdit,
        format: ExportFormat = .horizontal16x9,
        allowExternalOriginalMedia: Bool = false,
        allowedOriginalMediaRootPath: String? = nil,
        sequenceRangeOverride: [ClosedRange<Double>]? = nil
    ) async throws -> AVPlayerItem {
        let composition = AVMutableComposition()

        var layerInstructions: [AVMutableVideoCompositionLayerInstruction] = []
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

        let sequenceHasActiveTags = sequence.lanes.contains { lane in
            lane.metadata?.ignoreForProduction != true && lane.tags.contains { $0.type == .active }
        }

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
                        && !Self.isOriginalPathAllowed(proxyURL.path, allowedRootPath: allowedOriginalMediaRootPath) {
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
                    if sequenceHasActiveTags && !isAudioOnly {
                        segmentSequenceRanges = lane.tags
                            .filter { $0.type == .active }
                            .flatMap { tag -> [ClosedRange<Double>] in
                                let tagSeqStart = tag.startTime + sourceVideo.offset
                                let tagSeqEnd = tagSeqStart + max(0, tag.duration)
                                guard tagSeqStart < tagSeqEnd else { return [] }
                                return validRanges.compactMap { validRange in
                                    let start = max(tagSeqStart, validRange.lowerBound)
                                    let end = min(tagSeqEnd, validRange.upperBound)
                                    return start < end ? start...end : nil
                                }
                            }
                    }
                    segmentSequenceRanges = Self.normalizedRenderableRanges(
                        segmentSequenceRanges,
                        minimumDuration: minimumRenderableSegmentDuration
                    )

                    var segments: [(CMTimeRange, CMTime)] = []

                    for sequenceRange in segmentSequenceRanges {
                        let mediaStart = max(0, sequenceRange.lowerBound - sourceVideo.offset)
                        let mediaEnd = min(sourceVideo.duration, sequenceRange.upperBound - sourceVideo.offset)

                        if mediaEnd - mediaStart >= minimumRenderableSegmentDuration {
                            let duration = mediaEnd - mediaStart
                            let mediaTimeRange = CMTimeRange(
                                start: CMTime(seconds: mediaStart, preferredTimescale: 600),
                                duration: CMTime(seconds: duration, preferredTimescale: 600)
                            )

                            let sequenceStart = mediaStart + sourceVideo.offset
                            let programStart = Self.programTime(for: sequenceStart, in: validRanges)

                            segments.append((mediaTimeRange, CMTime(seconds: programStart, preferredTimescale: 600)))
                        }
                    }

                    if segments.isEmpty {
                        continue
                    }

                    if let svTrack = sourceVideoTracks.first {
                        if let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) {
                            for segment in segments {
                                try compVideoTrack.insertTimeRange(segment.0, of: svTrack, at: segment.1)
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

                            if sequenceHasActiveTags {
                                layerInstruction.setOpacity(0.0, at: .zero)
                                let activeTags = lane.tags.filter { $0.type == .active }
                                for tag in activeTags {
                                    let tagSeqStart = tag.startTime + sourceVideo.offset
                                    let tagSeqEnd = tagSeqStart + tag.duration
                                    let activeVisualLaneIds = Self.activeVisualLaneIDs(
                                        at: (tagSeqStart + tagSeqEnd) / 2,
                                        in: sequence
                                    )
                                    let slotFrame = Self.programSlotFrame(
                                        for: lane.id,
                                        activeLaneIds: activeVisualLaneIds,
                                        format: format,
                                        renderSize: targetRenderSize
                                    )
                                    let pStart = Self.programTime(for: tagSeqStart, in: validRanges)
                                    let pEnd = Self.programTime(for: tagSeqEnd, in: validRanges)

                                    if pStart < pEnd {
                                        let start = CMTime(seconds: pStart, preferredTimescale: 600)
                                        let end = CMTime(seconds: pEnd, preferredTimescale: 600)

                                        let tagTransform = Self.aspectFillTransform(
                                            naturalSize: naturalSize,
                                            preferredTransform: preferredTransform,
                                            renderFrame: slotFrame,
                                            cropAdjustment: Self.programCropAdjustment(for: lane, format: format, at: tagSeqStart)
                                        )
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
                                            validRanges: validRanges
                                        )
                                        layerInstruction.setOpacity(1.0, at: start)
                                        layerInstruction.setOpacity(0.0, at: end)
                                    }
                                }
                            }

                            layerInstructions.append(layerInstruction)
                        }
                    }

                    if isAudioOnly, let saTrack = sourceAudioTracks.first {
                        if let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
                            for segment in segments {
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

            let instruction: AVVideoCompositionInstructionProtocol

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
                instruction = reframingInstruction
            } else {
                let standardInstruction = AVMutableVideoCompositionInstruction()
                standardInstruction.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: compositionDuration, preferredTimescale: 600))
                standardInstruction.layerInstructions = layerInstructions
                instruction = standardInstruction
            }

            videoComposition.instructions = [instruction]
            playerItem.videoComposition = videoComposition
        }

        return playerItem
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

        let audioLanes = sequence.lanes.filter { lane in
            guard lane.metadata?.ignoreForProduction != true else { return false }
            guard let sourceVideo = lane.sourceVideo else { return false }
            return Self.isAudioOnlyLane(lane, sourceVideo: sourceVideo)
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
            guard let compAudioTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else { continue }

            for validRange in validRanges {
                let mediaStart = max(0, validRange.lowerBound - sourceVideo.offset)
                let mediaEnd = min(sourceVideo.duration, validRange.upperBound - sourceVideo.offset)
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

    private static func activeVisualLaneIDs(at sequenceTime: Double, in sequence: MediaSequence) -> [UUID] {
        sequence.lanes
            .filter { lane in
                guard lane.metadata?.ignoreForProduction != true else { return false }
                guard let sourceVideo = lane.sourceVideo else { return false }
                guard isPlayableVisualLane(lane, sourceVideo: sourceVideo) else { return false }
                let localTime = sequenceTime - sourceVideo.offset
                return lane.tags.contains { tag in
                    tag.type == .active &&
                    localTime >= tag.startTime &&
                    localTime < tag.startTime + max(0, tag.duration)
                }
            }
            .sorted { lhs, rhs in
                programLaneSortKey(lhs) < programLaneSortKey(rhs)
            }
            .map(\.id)
    }

    private static func isPlayableVisualLane(_ lane: VideoLane, sourceVideo: SourceVideo) -> Bool {
        guard lane.metadata?.ignoreForProduction != true else { return false }
        guard !isAudioOnlyLane(lane, sourceVideo: sourceVideo) else { return false }
        let rawPath = sourceVideo.mediaURL.path
        if rawPath.contains("__quipsly_missing_media__") || lane.metadata?.declaredExists == false {
            return false
        }
        guard let proxyURL = sourceVideo.proxyURL else {
            return false
        }
        if isProtectedOriginalPath(proxyURL.path) {
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
        for laneId: UUID,
        activeLaneIds: [UUID],
        format: ExportFormat,
        renderSize: CGSize
    ) -> CGRect {
        guard activeLaneIds.count > 1,
              let index = activeLaneIds.firstIndex(of: laneId) else {
            return CGRect(origin: .zero, size: renderSize)
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

    private static func applyProgramCropKeyframes(
        to layerInstruction: AVMutableVideoCompositionLayerInstruction,
        lane: VideoLane,
        format: ExportFormat,
        naturalSize: CGSize,
        preferredTransform: CGAffineTransform,
        renderFrame: CGRect,
        sequenceStart: Double,
        sequenceEnd: Double,
        validRanges: [ClosedRange<Double>]
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

            let startTransform = Self.aspectFillTransform(
                naturalSize: naturalSize,
                preferredTransform: preferredTransform,
                renderFrame: renderFrame,
                cropAdjustment: Self.programCropAdjustment(for: lane, format: format, at: startSequenceTime)
            )
            let endTransform = Self.aspectFillTransform(
                naturalSize: naturalSize,
                preferredTransform: preferredTransform,
                renderFrame: renderFrame,
                cropAdjustment: Self.programCropAdjustment(for: lane, format: format, at: endSequenceTime)
            )
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
}
