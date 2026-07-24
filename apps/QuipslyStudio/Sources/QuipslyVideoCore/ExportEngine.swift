import Foundation
import AVFoundation
import QuartzCore

public enum ExportError: Error, LocalizedError {
    case invalidPlayerItem
    case invalidExportRange(String)
    case exportSessionCreationFailed
    case exportFailed(Error?)

    public var errorDescription: String? {
        switch self {
        case .invalidPlayerItem:
            return "The editor could not build a playable export item."
        case .invalidExportRange(let reason):
            return "The requested export range is not renderable: \(reason)"
        case .exportSessionCreationFailed:
            return "The editor could not create an AV export session."
        case .exportFailed(let error):
            guard let error else {
                return "The export failed for an unknown reason."
            }
            let nsError = error as NSError
            var parts = [error.localizedDescription, "\(nsError.domain) \(nsError.code)"]
            if let failureReason = nsError.localizedFailureReason, !failureReason.isEmpty {
                parts.append(failureReason)
            }
            if let recoverySuggestion = nsError.localizedRecoverySuggestion, !recoverySuggestion.isEmpty {
                parts.append(recoverySuggestion)
            }
            if let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? NSError {
                parts.append("underlying: \(underlying.localizedDescription) (\(underlying.domain) \(underlying.code))")
            }
            return parts.joined(separator: " | ")
        }
    }
}

@MainActor
public class ExportEngine: ObservableObject {
    public static let shared = ExportEngine()

    @Published public var isExporting = false
    @Published public var exportProgress: Float = 0.0

    private var exportTimer: Timer?

    private init() {}

    public func export(
        sequence: MediaSequence,
        to outputURL: URL,
        format: ExportFormat,
        allowExternalOriginalMedia: Bool = false,
        allowedOriginalMediaRootPath: String? = nil,
        sequenceStartSeconds: Double? = nil,
        sequenceDurationSeconds: Double? = nil,
        sequenceRanges: [(start: Double, duration: Double)] = [],
        durationLimitSeconds: Double? = nil,
        allowPixelTextOverlays: Bool = false,
        primaryOverlayText: String? = nil,
        captionText: String? = nil
    ) async throws {
        self.isExporting = true
        self.exportProgress = 0.0

        defer {
            self.isExporting = false
            self.exportTimer?.invalidate()
            self.exportTimer = nil
        }

        let builder = AVCompositionBuilder()
        let explicitRanges = sequenceRanges
            .filter { $0.start.isFinite && $0.duration.isFinite && $0.duration > 0 }
            .map { $0.start...($0.start + $0.duration) }
        let playerItem = try await builder.buildPlayerItem(
            for: sequence,
            mode: .playEdit,
            format: format,
            allowExternalOriginalMedia: allowExternalOriginalMedia,
            allowedOriginalMediaRootPath: allowedOriginalMediaRootPath,
            sequenceRangeOverride: explicitRanges.isEmpty ? nil : explicitRanges
        )

        guard let asset = playerItem.asset as? AVComposition else {
            throw ExportError.invalidPlayerItem
        }

        let presetName = format == .horizontal16x9 ? AVAssetExportPreset1920x1080 : AVAssetExportPresetHighestQuality

        guard let exportSession = AVAssetExportSession(asset: asset, presetName: presetName) else {
            throw ExportError.exportSessionCreationFailed
        }

        let outputDirectory = outputURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: outputDirectory.path) {
            try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
        }
        if FileManager.default.fileExists(atPath: outputURL.path) {
            try FileManager.default.removeItem(at: outputURL)
        }

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.videoComposition = Self.videoComposition(
            from: playerItem.videoComposition,
            format: format,
            allowPixelTextOverlays: allowPixelTextOverlays,
            primaryOverlayText: primaryOverlayText,
            captionText: captionText
        )
        exportSession.audioMix = Self.audioMix(from: asset)
        exportSession.shouldOptimizeForNetworkUse = true

        if !explicitRanges.isEmpty {
            // The composition was already collapsed to the requested recipe ranges.
        } else if let sequenceStartSeconds,
           let sequenceDurationSeconds,
           sequenceStartSeconds.isFinite,
           sequenceDurationSeconds.isFinite,
           sequenceDurationSeconds > 0 {
            try Self.applySequenceTimeRange(
                to: exportSession,
                asset: asset,
                sequence: sequence,
                sequenceStartSeconds: sequenceStartSeconds,
                sequenceDurationSeconds: sequenceDurationSeconds
            )
        } else if let durationLimitSeconds, durationLimitSeconds.isFinite, durationLimitSeconds > 0 {
            let assetDurationSeconds = CMTimeGetSeconds(asset.duration)
            let boundedSeconds = min(durationLimitSeconds, max(0.1, assetDurationSeconds))
            exportSession.timeRange = CMTimeRange(
                start: .zero,
                duration: CMTime(seconds: boundedSeconds, preferredTimescale: 600)
            )
        }

        // Start polling progress
        exportTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.exportProgress = exportSession.progress
            }
        }

        await exportSession.export()

        switch exportSession.status {
        case .completed:
            return // Success
        case .failed, .cancelled:
            throw ExportError.exportFailed(exportSession.error)
        default:
            throw ExportError.exportFailed(nil)
        }
    }

    public func exportAudioMaster(
        sequence: MediaSequence,
        to outputURL: URL,
        allowExternalOriginalMedia: Bool = false,
        allowedOriginalMediaRootPath: String? = nil,
        durationLimitSeconds: Double? = nil
    ) async throws {
        self.isExporting = true
        self.exportProgress = 0.0

        defer {
            self.isExporting = false
            self.exportTimer?.invalidate()
            self.exportTimer = nil
        }

        let builder = AVCompositionBuilder()
        let composition = try await builder.buildAudioMasterComposition(
            for: sequence,
            mode: .playEdit,
            allowExternalOriginalMedia: allowExternalOriginalMedia,
            allowedOriginalMediaRootPath: allowedOriginalMediaRootPath
        )

        guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetAppleM4A) else {
            throw ExportError.exportSessionCreationFailed
        }

        let outputDirectory = outputURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: outputDirectory.path) {
            try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
        }
        if FileManager.default.fileExists(atPath: outputURL.path) {
            try FileManager.default.removeItem(at: outputURL)
        }

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .m4a
        exportSession.audioMix = Self.audioMix(from: composition)
        exportSession.shouldOptimizeForNetworkUse = true

        if let durationLimitSeconds, durationLimitSeconds.isFinite, durationLimitSeconds > 0 {
            let assetDurationSeconds = CMTimeGetSeconds(composition.duration)
            let boundedSeconds = min(durationLimitSeconds, max(0.1, assetDurationSeconds))
            exportSession.timeRange = CMTimeRange(
                start: .zero,
                duration: CMTime(seconds: boundedSeconds, preferredTimescale: 600)
            )
        }

        exportTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.exportProgress = exportSession.progress
            }
        }

        await exportSession.export()

        switch exportSession.status {
        case .completed:
            return
        case .failed, .cancelled:
            throw ExportError.exportFailed(exportSession.error)
        default:
            throw ExportError.exportFailed(nil)
        }
    }

    private static func applySequenceTimeRange(
        to exportSession: AVAssetExportSession,
        asset: AVComposition,
        sequence: MediaSequence,
        sequenceStartSeconds: Double,
        sequenceDurationSeconds: Double
    ) throws {
        let validRanges = PlaybackEngine.computeValidRanges(for: sequence)
        guard !validRanges.isEmpty else {
            throw ExportError.invalidExportRange("Play Edit has no active ranges to export.")
        }

        let sequenceDuration = max(0, sequence.duration)
        let clampedSequenceStart = min(max(0, sequenceStartSeconds), sequenceDuration)
        let requestedSequenceEnd = min(sequenceDuration, max(clampedSequenceStart, clampedSequenceStart + sequenceDurationSeconds))
        guard requestedSequenceEnd > clampedSequenceStart else {
            throw ExportError.invalidExportRange("The short range has no positive duration.")
        }

        let compositionStart = programTime(for: clampedSequenceStart, in: validRanges)
        let compositionEnd = programTime(for: requestedSequenceEnd, in: validRanges)
        guard compositionEnd > compositionStart else {
            throw ExportError.invalidExportRange("The requested range falls entirely inside skipped gaps.")
        }

        let assetDurationSeconds = CMTimeGetSeconds(asset.duration)
        guard assetDurationSeconds.isFinite, assetDurationSeconds > compositionStart else {
            throw ExportError.invalidExportRange("The rendered program is shorter than the requested start time.")
        }

        let boundedDuration = min(compositionEnd - compositionStart, assetDurationSeconds - compositionStart)
        guard boundedDuration > 0 else {
            throw ExportError.invalidExportRange("The mapped program range has no renderable duration.")
        }

        exportSession.timeRange = CMTimeRange(
            start: CMTime(seconds: compositionStart, preferredTimescale: 600),
            duration: CMTime(seconds: boundedDuration, preferredTimescale: 600)
        )
    }

    private static func programTime(for sequenceTime: Double, in validRanges: [ClosedRange<Double>]) -> Double {
        var pTime: Double = 0
        for range in validRanges {
            if sequenceTime < range.lowerBound {
                break
            } else if sequenceTime <= range.upperBound {
                pTime += sequenceTime - range.lowerBound
                break
            } else {
                pTime += range.upperBound - range.lowerBound
            }
        }
        return pTime
    }

    private static func videoComposition(
        from source: AVVideoComposition?,
        format: ExportFormat,
        allowPixelTextOverlays: Bool,
        primaryOverlayText: String?,
        captionText: String?
    ) -> AVVideoComposition? {
        // Text burn-in is intentionally opt-in at the lowest export boundary.
        // Short hooks, captions, and platform copy are valuable metadata, but
        // accidental pixel text on faces is worse than a missing overlay. Until
        // the editor has an explicit face-safe placement system, normal exports
        // stay clean even if higher-level metadata contains text.
        guard allowPixelTextOverlays else {
            return source
        }

        let overlay = normalizedText(primaryOverlayText)
        let caption = normalizedText(captionText)
        guard !overlay.isEmpty || !caption.isEmpty else {
            return source
        }

        guard let mutableComposition = source?.mutableCopy() as? AVMutableVideoComposition else {
            return source
        }

        let renderSize: CGSize
        switch format {
        case .horizontal16x9:
            renderSize = CGSize(width: 1920, height: 1080)
        case .vertical9x16:
            renderSize = CGSize(width: 1080, height: 1920)
        }

        let parentLayer = CALayer()
        parentLayer.frame = CGRect(origin: .zero, size: renderSize)
        parentLayer.masksToBounds = true

        let videoLayer = CALayer()
        videoLayer.frame = CGRect(origin: .zero, size: renderSize)
        parentLayer.addSublayer(videoLayer)

        if !overlay.isEmpty {
            parentLayer.addSublayer(
                textPlateLayer(
                    text: overlay,
                    frame: primaryOverlayFrame(for: renderSize, format: format),
                    fontSize: format == .vertical9x16 ? 58 : 44,
                    backgroundAlpha: 0.58
                )
            )
        }

        if !caption.isEmpty {
            parentLayer.addSublayer(
                textPlateLayer(
                    text: caption,
                    frame: captionFrame(for: renderSize, format: format),
                    fontSize: format == .vertical9x16 ? 42 : 32,
                    backgroundAlpha: 0.68
                )
            )
        }

        mutableComposition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: videoLayer,
            in: parentLayer
        )
        return mutableComposition
    }

    private static func audioMix(from composition: AVComposition) -> AVAudioMix? {
        let audioTracks = composition.tracks(withMediaType: .audio)
        guard !audioTracks.isEmpty else {
            return nil
        }

        let mix = AVMutableAudioMix()
        mix.inputParameters = audioTracks.map { track in
            let parameters = AVMutableAudioMixInputParameters(track: track)
            parameters.setVolume(1.0, at: .zero)
            return parameters
        }
        return mix
    }

    private static func normalizedText(_ value: String?) -> String {
        (value ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    }

    private static func primaryOverlayFrame(for renderSize: CGSize, format: ExportFormat) -> CGRect {
        if format == .vertical9x16 {
            let margin = renderSize.width * 0.08
            let height = renderSize.height * 0.075
            // Vertical shorts are usually close-up faces. If text is explicitly
            // approved for pixel burn-in, keep the primary hook in the top
            // canopy rail instead of the center/lower face band. Captions and
            // drafts should normally stay sidecar/platform copy unless a human
            // has made a separate face-safe decision.
            return coreAnimationFrame(
                renderSize: renderSize,
                visualTop: renderSize.height * 0.055,
                x: margin,
                width: renderSize.width - (margin * 2),
                height: height
            )
        }
        let margin = renderSize.width * 0.075
        let height = renderSize.height * 0.12
        return CGRect(
            x: margin,
            y: renderSize.height - height - (renderSize.height * 0.08),
            width: renderSize.width - (margin * 2),
            height: height
        )
    }

    private static func captionFrame(for renderSize: CGSize, format: ExportFormat) -> CGRect {
        if format == .vertical9x16 {
            let margin = renderSize.width * 0.10
            let height = renderSize.height * 0.09
            return coreAnimationFrame(
                renderSize: renderSize,
                visualTop: renderSize.height * 0.835,
                x: margin,
                width: renderSize.width - (margin * 2),
                height: height
            )
        }
        let margin = renderSize.width * 0.065
        let height = renderSize.height * 0.16
        return CGRect(
            x: margin,
            y: renderSize.height * 0.08,
            width: renderSize.width - (margin * 2),
            height: height
        )
    }

    private static func coreAnimationFrame(
        renderSize: CGSize,
        visualTop: CGFloat,
        x: CGFloat,
        width: CGFloat,
        height: CGFloat
    ) -> CGRect {
        CGRect(
            x: x,
            y: renderSize.height - visualTop - height,
            width: width,
            height: height
        )
    }

    private static func textPlateLayer(
        text: String,
        frame: CGRect,
        fontSize: CGFloat,
        backgroundAlpha: CGFloat
    ) -> CALayer {
        let plate = CALayer()
        plate.frame = frame
        plate.cornerRadius = min(frame.height * 0.22, 32)
        plate.backgroundColor = CGColor(gray: 0.02, alpha: backgroundAlpha)
        plate.borderColor = CGColor(gray: 1.0, alpha: 0.20)
        plate.borderWidth = 2
        plate.masksToBounds = true

        let inset = max(18, frame.height * 0.14)
        let textLayer = CATextLayer()
        textLayer.frame = plate.bounds.insetBy(dx: inset, dy: inset * 0.72)
        textLayer.string = text
        textLayer.foregroundColor = CGColor(gray: 1.0, alpha: 0.96)
        textLayer.alignmentMode = .center
        textLayer.truncationMode = .end
        textLayer.isWrapped = true
        textLayer.fontSize = fontSize
        textLayer.contentsScale = 2.0
        plate.addSublayer(textLayer)

        return plate
    }
}
