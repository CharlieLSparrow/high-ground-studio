import Foundation
import AVFoundation
import Accelerate

public actor AudioSyncer {
    public static let shared = AudioSyncer()
    
    public init() {}
    
    public func syncSequence(_ sequence: MediaSequence) async throws -> MediaSequence {
        var updatedSequence = sequence
        guard updatedSequence.lanes.count > 1 else { return sequence }
        
        let refLane = updatedSequence.lanes[0]
        guard let refVideo = refLane.sourceVideo else { return sequence }
        
        for i in 1..<updatedSequence.lanes.count {
            guard let targetVideo = updatedSequence.lanes[i].sourceVideo else { continue }
            
            do {
                let offset = try await computeOffset(refURL: refVideo.mediaURL, targetURL: targetVideo.mediaURL)
                updatedSequence.lanes[i].sourceVideo?.offset = offset
            } catch {
                print("Failed to sync lane \(updatedSequence.lanes[i].name): \(error)")
            }
        }
        
        return updatedSequence
    }
    
    private func computeOffset(refURL: URL, targetURL: URL) async throws -> Double {
        let sampleRate: Float64 = 8000
        let refSamples = try await extractAudioSamples(from: refURL, sampleRate: sampleRate)
        let targetSamples = try await extractAudioSamples(from: targetURL, sampleRate: sampleRate)
        
        guard !refSamples.isEmpty, !targetSamples.isEmpty else {
            throw NSError(domain: "AudioSyncer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to extract audio samples"])
        }
        
        let M = targetSamples.count
        let paddedRef = [Float](repeating: 0, count: M - 1) + refSamples + [Float](repeating: 0, count: M - 1)
        
        // Perform cross-correlation natively using vDSP
        let result = vDSP.correlate(paddedRef, withKernel: targetSamples)
        
        guard let maxVal = result.max(), let maxIndex = result.firstIndex(of: maxVal) else { return 0 }
        let delaySamples = maxIndex - (M - 1)
        
        return Double(delaySamples) / sampleRate
    }
    
    private func extractAudioSamples(from url: URL, sampleRate: Float64) async throws -> [Float] {
        let asset = AVURLAsset(url: url)
        let reader = try AVAssetReader(asset: asset)
        guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
            throw NSError(domain: "AudioSyncer", code: 2, userInfo: [NSLocalizedDescriptionKey: "No audio track found in \(url.lastPathComponent)"])
        }
        
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false
        ]
        
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        reader.add(output)
        reader.startReading()
        
        var samples: [Float] = []
        // Read up to 30 seconds to bound memory and processing time
        let maxSamples = Int(sampleRate * 30.0)
        
        while let sampleBuffer = output.copyNextSampleBuffer() {
            guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { continue }
            let length = CMBlockBufferGetDataLength(blockBuffer)
            var bytes = [Float](repeating: 0, count: length / MemoryLayout<Float>.size)
            CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: length, destination: &bytes)
            samples.append(contentsOf: bytes)
            if samples.count > maxSamples {
                break
            }
        }
        
        if samples.count > maxSamples {
            samples = Array(samples.prefix(maxSamples))
        }
        return samples
    }
}
