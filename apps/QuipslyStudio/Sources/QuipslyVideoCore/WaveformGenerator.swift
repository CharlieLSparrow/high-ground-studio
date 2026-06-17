import AVFoundation
import Accelerate

@MainActor
public class WaveformGenerator: ObservableObject {
    public static let shared = WaveformGenerator()

    @Published public var waveforms: [UUID: [Float]] = [:]
    @Published public var waveformErrors: [UUID: String] = [:]
    @Published public private(set) var inFlight: Set<UUID> = []

    public init() {}

    public func generateWaveform(for source: SourceVideo, analysisURL: URL? = nil, targetSamples: Int = 1000) {
        if waveforms[source.id] != nil { return }
        if inFlight.contains(source.id) { return }

        let sourceID = source.id
        guard let waveformURL = analysisURL ?? source.proxyURL else {
            waveformErrors[sourceID] = "Waveform requires a local proxy or an explicitly approved analysis URL."
            return
        }
        let sampleTarget = Self.boundedTargetSampleCount(targetSamples)

        inFlight.insert(sourceID)
        waveformErrors[sourceID] = nil

        Task.detached(priority: .background) {
            do {
                let finalWaveform = try await Self.readBoundedWaveform(from: waveformURL, targetSamples: sampleTarget)
                await MainActor.run {
                    self.inFlight.remove(sourceID)
                    self.waveforms[sourceID] = finalWaveform
                }
            } catch {
                await MainActor.run {
                    self.inFlight.remove(sourceID)
                    self.waveformErrors[sourceID] = error.localizedDescription
                }
            }
        }
    }

    nonisolated private static func boundedTargetSampleCount(_ requested: Int) -> Int {
        min(max(requested, 96), 2_400)
    }

    nonisolated private static func readBoundedWaveform(from url: URL, targetSamples: Int) async throws -> [Float] {
        let asset = AVURLAsset(url: url)
        guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
            throw WaveformError.noAudioTrack
        }

        let reader = try AVAssetReader(asset: asset)
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false
        ]

        let trackOutput = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        guard reader.canAdd(trackOutput) else {
            throw WaveformError.readerRejectedTrack
        }
        reader.add(trackOutput)

        guard reader.startReading() else {
            throw reader.error ?? WaveformError.readerFailed
        }

        var buckets: [Float] = []
        buckets.reserveCapacity(targetSamples)
        let maxBucketsBeforeCompaction = max(targetSamples * 12, 512)
        let maxBytesPerChunk = 128 * 1024

        while let sampleBuffer = trackOutput.copyNextSampleBuffer() {
            guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { continue }
            let length = CMBlockBufferGetDataLength(blockBuffer)
            guard length > 0 else { continue }

            var offset = 0
            while offset < length {
                let chunkBytes = min(maxBytesPerChunk, length - offset)
                let int16Count = chunkBytes / MemoryLayout<Int16>.size
                guard int16Count > 0 else { break }

                var pcm = [Int16](repeating: 0, count: int16Count)
                let copyStatus = CMBlockBufferCopyDataBytes(
                    blockBuffer,
                    atOffset: offset,
                    dataLength: int16Count * MemoryLayout<Int16>.size,
                    destination: &pcm
                )
                guard copyStatus == noErr else {
                    throw WaveformError.blockCopyFailed
                }

                var floats = [Float](repeating: 0, count: int16Count)
                var scale: Float = 1.0 / Float(Int16.max)
                vDSP_vflt16(pcm, 1, &floats, 1, vDSP_Length(int16Count))
                vDSP_vsmul(floats, 1, &scale, &floats, 1, vDSP_Length(int16Count))

                var rms: Float = 0
                vDSP_rmsqv(floats, 1, &rms, vDSP_Length(int16Count))
                buckets.append(rms.isFinite ? min(max(rms, 0), 1) : 0)

                if buckets.count > maxBucketsBeforeCompaction {
                    buckets = compactBuckets(buckets)
                }

                offset += int16Count * MemoryLayout<Int16>.size
            }
        }

        if reader.status == .failed {
            throw reader.error ?? WaveformError.readerFailed
        }

        guard !buckets.isEmpty else {
            throw WaveformError.emptyAudio
        }

        return resampleBuckets(buckets, targetSamples: targetSamples)
    }

    nonisolated private static func compactBuckets(_ input: [Float]) -> [Float] {
        guard input.count > 1 else { return input }
        var compacted: [Float] = []
        compacted.reserveCapacity(input.count / 2 + 1)

        var index = 0
        while index < input.count {
            if index + 1 < input.count {
                compacted.append(max(input[index], input[index + 1]))
            } else {
                compacted.append(input[index])
            }
            index += 2
        }

        return compacted
    }

    nonisolated private static func resampleBuckets(_ input: [Float], targetSamples: Int) -> [Float] {
        guard targetSamples > 0 else { return [] }
        guard !input.isEmpty else { return Array(repeating: 0, count: targetSamples) }
        guard input.count != targetSamples else { return input }

        let ratio = Double(input.count) / Double(targetSamples)
        return (0..<targetSamples).map { outputIndex in
            let sourceIndex = min(input.count - 1, Int(Double(outputIndex) * ratio))
            return input[sourceIndex]
        }
    }
}

private enum WaveformError: LocalizedError {
    case noAudioTrack
    case readerRejectedTrack
    case readerFailed
    case emptyAudio
    case blockCopyFailed

    var errorDescription: String? {
        switch self {
        case .noAudioTrack:
            return "No audio track found for waveform."
        case .readerRejectedTrack:
            return "Audio reader could not attach to this track."
        case .readerFailed:
            return "Audio reader failed before waveform generation completed."
        case .emptyAudio:
            return "Audio track produced no waveform samples."
        case .blockCopyFailed:
            return "Audio sample copy failed during waveform generation."
        }
    }
}
