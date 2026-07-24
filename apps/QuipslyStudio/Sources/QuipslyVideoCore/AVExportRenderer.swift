import Foundation
import AVFoundation


public enum AVExportError: Error {
    case compositionFailed
    case exportSessionCreationFailed
    case exportFailed(Error?)
}

public actor AVExportRenderer {
    public init() {}

    /// Exports specific tagged clips from the sequence to an output directory.
    @MainActor
    public func exportClips(
        from sequence: MediaSequence,
        withTag type: TagType,
        format: ExportFormat,
        to outputDirectory: URL,
        onProgress: @escaping @Sendable (Double) -> Void = { _ in }
    ) async throws -> [URL] {
        // Collect all tags of the specified type from all lanes to determine clip regions.
        var clipTimeRanges: [CMTimeRange] = []

        for lane in sequence.lanes {
            for tag in lane.tags where tag.type == type {
                let start = CMTime(seconds: tag.startTime, preferredTimescale: 600)
                let duration = CMTime(seconds: tag.duration, preferredTimescale: 600)
                clipTimeRanges.append(CMTimeRange(start: start, duration: duration))
            }
        }

        // Remove duplicates and sort (in a real app we'd resolve overlaps)
        clipTimeRanges.sort { $0.start < $1.start }

        var exportedURLs: [URL] = []

        let builder = AVCompositionBuilder()
        let playerItem = try await builder.buildPlayerItem(for: sequence)

        guard let masterComposition = playerItem.asset as? AVComposition else {
            throw AVExportError.compositionFailed
        }

        let masterVideoComposition = playerItem.videoComposition?.mutableCopy() as? AVMutableVideoComposition

        let targetRenderSize: CGSize
        switch format {
        case .horizontal16x9:
            targetRenderSize = CGSize(width: 1920, height: 1080)
        case .vertical9x16:
            targetRenderSize = CGSize(width: 1080, height: 1920)
        }

        masterVideoComposition?.renderSize = targetRenderSize

        if format == .vertical9x16 {
            if let instructions = masterVideoComposition?.instructions as? [AVMutableVideoCompositionInstruction] {
                for instruction in instructions {
                    if let layerInstructions = instruction.layerInstructions as? [AVMutableVideoCompositionLayerInstruction] {

                        var newLayerInstructions: [AVMutableVideoCompositionLayerInstruction] = []

                        for layerInstruction in layerInstructions {
                            let mutableLayerInstruction = layerInstruction.mutableCopy() as! AVMutableVideoCompositionLayerInstruction

                            let initialFrame = sequence.orientationTrack.interpolatedFrame(at: 0)

                            let scale = 90.0 / max(initialFrame.fov, 1.0)
                            let offsetX = 0.5 + (initialFrame.yaw / 360.0)
                            let offsetY = 0.5 + (initialFrame.pitch / 180.0)

                            var transform = CGAffineTransform(translationX: -420 + offsetX, y: 420 + offsetY)
                            transform = transform.scaledBy(x: scale, y: scale)

                            mutableLayerInstruction.setTransform(transform, at: .zero)
                            newLayerInstructions.append(mutableLayerInstruction)
                        }

                        instruction.layerInstructions = newLayerInstructions
                    }
                }
            }
        }

        let fileManager = FileManager.default
        if !fileManager.fileExists(atPath: outputDirectory.path) {
            try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
        }

        let totalClips = clipTimeRanges.count

        for (index, timeRange) in clipTimeRanges.enumerated() {
            let outputURL = outputDirectory.appendingPathComponent("\(sequence.title)_Clip\(index + 1).mp4")

            if fileManager.fileExists(atPath: outputURL.path) {
                try fileManager.removeItem(at: outputURL)
            }

            guard let exportSession = AVAssetExportSession(asset: masterComposition, presetName: AVAssetExportPresetHighestQuality) else {
                throw AVExportError.exportSessionCreationFailed
            }

            exportSession.outputURL = outputURL
            exportSession.outputFileType = .mp4
            exportSession.timeRange = timeRange
            exportSession.videoComposition = masterVideoComposition

            // Monitor progress asynchronously
            let baseProgress = Double(index) / Double(max(1, totalClips))
            let clipProgressWeight = 1.0 / Double(max(1, totalClips))

            let progressTask = Task {
                while exportSession.status == .waiting || exportSession.status == .exporting {
                    let overallProgress = baseProgress + (Double(exportSession.progress) * clipProgressWeight)
                    onProgress(overallProgress)
                    try? await Task.sleep(nanoseconds: 100_000_000) // 0.1s
                }
            }

            await exportSession.export()
            progressTask.cancel()

            if exportSession.status == .completed {
                exportedURLs.append(outputURL)
                onProgress(baseProgress + clipProgressWeight)
            } else {
                throw AVExportError.exportFailed(exportSession.error)
            }
        }

        return exportedURLs
    }
}
