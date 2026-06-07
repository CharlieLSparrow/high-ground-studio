import Foundation
import AVFoundation
import Combine

class ExportManager: ObservableObject {
    @Published var isExporting = false
    @Published var exportProgress: Float = 0.0
    @Published var exportSuccess: Bool = false
    @Published var exportError: String?

    private var exportSession: AVAssetExportSession?
    private var progressTimer: Timer?

    func exportTimeline(_ timelineState: TimelineState) {
        guard !timelineState.clips.isEmpty else {
            self.exportError = "No clips in timeline."
            return
        }

        self.isExporting = true
        self.exportProgress = 0.0
        self.exportSuccess = false
        self.exportError = nil

        let composition = AVMutableComposition()
        let videoComposition = AVMutableVideoComposition()
        videoComposition.customVideoCompositorClass = ReframingCompositor.self
        videoComposition.renderSize = CGSize(width: 1080, height: 1920) // 9:16 Shorts format
        videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

        var instructions: [AVVideoCompositionInstructionProtocol] = []

        // Build the composition tracks
        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            self.exportError = "Failed to create video track"
            self.isExporting = false
            return
        }

        var currentTime = CMTime.zero

        // This is a simplified sequential builder for the prototype
        // It assumes a single linear track
        for clip in timelineState.clips {
            guard !clip.deactivated else { continue }

            var fileURL = Bundle.main.url(forResource: clip.mediaAssetId, withExtension: "mp4")
            if fileURL == nil {
                let projPath = "/Users/wall-e/Dev/high-ground-studio/apps/mobile-capture/HighGroundCapture/HighGroundCapture/\(clip.mediaAssetId).mp4"
                if FileManager.default.fileExists(atPath: projPath) {
                    fileURL = URL(fileURLWithPath: projPath)
                }
            }
            let finalURL = fileURL ?? URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("\(clip.mediaAssetId).mp4")
            let asset = AVURLAsset(url: finalURL)
            guard let assetTrack = asset.tracks(withMediaType: .video).first else { continue }

            let durationSeconds = clip.duration ?? CMTimeGetSeconds(asset.duration)
            let durationTime = CMTime(seconds: durationSeconds, preferredTimescale: 600)

            let timeRange = CMTimeRange(start: CMTime(seconds: clip.mediaOffset, preferredTimescale: 600), duration: durationTime)

            do {
                try videoTrack.insertTimeRange(timeRange, of: assetTrack, at: currentTime)

                // Build Reframing Instruction
                let keyframes = clip.transforms ?? []
                let instruction = ReframingCompositionInstruction(
                    timeRange: CMTimeRange(start: currentTime, duration: durationTime),
                    sourceTrackID: videoTrack.trackID,
                    keyframes: keyframes
                )
                instructions.append(instruction)

                currentTime = CMTimeAdd(currentTime, durationTime)
            } catch {
                print("Failed to insert track: \(error)")
            }
        }

        videoComposition.instructions = instructions

        guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            self.exportError = "Failed to create export session"
            self.isExporting = false
            return
        }

        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent("QuipslyExport_\(UUID().uuidString).mp4")

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.videoComposition = videoComposition

        self.exportSession = exportSession

        self.progressTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self, let session = self.exportSession else { return }
            DispatchQueue.main.async {
                self.exportProgress = session.progress
            }
        }

        exportSession.exportAsynchronously { [weak self] in
            guard let self = self else { return }

            DispatchQueue.main.async {
                self.progressTimer?.invalidate()
                self.progressTimer = nil
                self.isExporting = false

                switch exportSession.status {
                case .completed:
                    self.saveToDocuments(url: outputURL)
                case .failed, .cancelled:
                    self.exportError = exportSession.error?.localizedDescription ?? "Export failed"
                default:
                    break
                }
            }
        }
    }

    private func saveToDocuments(url: URL) {
        let fileManager = FileManager.default
        do {
            let documentsDirectory = try fileManager.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let destinationURL = documentsDirectory.appendingPathComponent(url.lastPathComponent)

            if fileManager.fileExists(atPath: destinationURL.path) {
                try fileManager.removeItem(at: destinationURL)
            }
            try fileManager.copyItem(at: url, to: destinationURL)

            DispatchQueue.main.async {
                self.exportProgress = 1.0
                self.exportSuccess = true
            }
        } catch {
            DispatchQueue.main.async {
                self.exportError = "Failed to save locally: \(error.localizedDescription)"
            }
        }
    }
}
