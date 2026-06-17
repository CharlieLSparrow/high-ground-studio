import Foundation
import AVFoundation

public enum AVCompositionError: Error {
    case invalidMediaURL(URL)
    case failedToLoadTracks
}

public actor AVCompositionBuilder {
    public init() {}
    
    @MainActor
    public func buildPlayerItem(for sequence: MediaSequence, mode: PlaybackMode = .playEdit) async throws -> AVPlayerItem {
        let composition = AVMutableComposition()
        
        var layerInstructions: [AVMutableVideoCompositionLayerInstruction] = []
        var compositionVideoTracks: [AVMutableCompositionTrack] = []
        
        let targetRenderSize = CGSize(width: 1920, height: 1080)
        
        // Ensure track order: V1 Base is at the bottom (rendered first), V2 Overlay on top
        // In the UI they might be ordered [V2, V1]. We reverse it here so V1 is processed first,
        // but AVVideoComposition processes instructions in the order they are added to the array.
        // The first instruction in the array is the TOP-MOST layer.
        // So we want V2's instruction first, then V1's instruction.
        
        let sequenceHasActiveTags = sequence.lanes.contains { lane in lane.tags.contains { $0.type == .active } }
        
        for lane in sequence.lanes {
            if let sourceVideo = lane.sourceVideo {
                let urlToUse = sourceVideo.proxyURL ?? sourceVideo.mediaURL
                let options: [String: Any]? = urlToUse.pathExtension.lowercased() == "insv" ? ["AVURLAssetOutOfBandMIMETypeKey": "video/mp4"] : nil
                let asset = AVURLAsset(url: urlToUse, options: options)
                
                do {
                    let sourceVideoTracks = try await asset.loadTracks(withMediaType: .video)
                    let sourceAudioTracks = try await asset.loadTracks(withMediaType: .audio)
                    
                    // Create segments for insertion
                    var currentMediaTime = 0.0
                    var currentTimelineTime = sourceVideo.offset
                    let totalDuration = sourceVideo.duration
                    
                    // Sort cut tags
                    let cutTags = mode == .playEdit ? lane.tags.filter { $0.type == .cut }.sorted { $0.startTime < $1.startTime } : []
                    
                    var segments: [(CMTimeRange, CMTime)] = [] // (mediaRange, timelineTime)
                    
                    for tag in cutTags {
                        if tag.startTime > currentMediaTime {
                            let duration = min(tag.startTime - currentMediaTime, totalDuration - currentMediaTime)
                            if duration > 0 {
                                let mediaRange = CMTimeRange(
                                    start: CMTime(seconds: currentMediaTime, preferredTimescale: 600),
                                    duration: CMTime(seconds: duration, preferredTimescale: 600)
                                )
                                segments.append((mediaRange, CMTime(seconds: currentTimelineTime, preferredTimescale: 600)))
                                
                                currentTimelineTime += duration
                            }
                        }
                        
                        // Skip the cut section in media time, but timeline time doesn't advance
                        currentMediaTime = max(currentMediaTime, tag.startTime + tag.duration)
                    }
                    
                    // Add remaining segment if any
                    if currentMediaTime < totalDuration {
                        let duration = totalDuration - currentMediaTime
                        let mediaRange = CMTimeRange(
                            start: CMTime(seconds: currentMediaTime, preferredTimescale: 600),
                            duration: CMTime(seconds: duration, preferredTimescale: 600)
                        )
                        segments.append((mediaRange, CMTime(seconds: currentTimelineTime, preferredTimescale: 600)))
                    }
                    
                    if let svTrack = sourceVideoTracks.first {
                        if let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) {
                            for segment in segments {
                                try compVideoTrack.insertTimeRange(segment.0, of: svTrack, at: segment.1)
                            }
                            compositionVideoTracks.append(compVideoTrack)
                            
                            let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideoTrack)
                            
                            if sequenceHasActiveTags {
                                layerInstruction.setOpacity(0.0, at: .zero)
                                let activeTags = lane.tags.filter { $0.type == .active }
                                for tag in activeTags {
                                    // tag.startTime is in media time. We need timeline time.
                                    let tagTimelineStart = tag.startTime + sourceVideo.offset
                                    let start = CMTime(seconds: tagTimelineStart, preferredTimescale: 600)
                                    let end = CMTime(seconds: tagTimelineStart + tag.duration, preferredTimescale: 600)
                                    
                                    layerInstruction.setOpacity(1.0, at: start)
                                    layerInstruction.setOpacity(0.0, at: end)
                                }
                            }
                            
                            layerInstructions.append(layerInstruction)
                        }
                    }
                    
                    if let saTrack = sourceAudioTracks.first {
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
            
            if !sequence.orientationTrack.keyframes.isEmpty, let baseTrack = compositionVideoTracks.first {
                videoComposition.customVideoCompositorClass = ReframingCompositor.self
                let reframingInstruction = ReframingCompositionInstruction(
                    timeRange: CMTimeRange(start: .zero, duration: CMTime(seconds: sequence.duration, preferredTimescale: 600)),
                    sourceTrackID: baseTrack.trackID,
                    keyframes: sequence.orientationTrack.keyframes
                )
                instruction = reframingInstruction
            } else {
                let standardInstruction = AVMutableVideoCompositionInstruction()
                standardInstruction.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: sequence.duration, preferredTimescale: 600))
                standardInstruction.layerInstructions = layerInstructions
                instruction = standardInstruction
            }
            
            videoComposition.instructions = [instruction]
            playerItem.videoComposition = videoComposition
        }
        
        return playerItem
    }
}
