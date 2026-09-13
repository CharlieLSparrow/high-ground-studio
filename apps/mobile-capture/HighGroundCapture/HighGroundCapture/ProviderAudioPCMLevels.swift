import AVFoundation
import Foundation

/// Silence replaces samples, never the elapsed timeline. Allocate our own
/// buffer: the provider owns its input and may still need it for call routing.
enum ProviderAudioPrivacyBuffer {
    static func silence(matching input: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let output = AVAudioPCMBuffer(pcmFormat: input.format, frameCapacity: input.frameLength) else { return nil }
        output.frameLength = input.frameLength
        for buffer in UnsafeMutableAudioBufferListPointer(output.mutableAudioBufferList) {
            if let data = buffer.mData { memset(data, 0, Int(buffer.mDataByteSize)) }
        }
        return output
    }
}

struct ProviderAudioPCMLevelSnapshot: Equatable, Sendable {
    let averagePowerDBFS: Float
    let peakPowerDBFS: Float
}

/// Computes transient electrical levels from the exact PCM already owned by
/// LiveKit. This helper never stores, uploads, or writes an audio buffer.
enum ProviderAudioPCMLevelAnalyzer {
    static func levels(for buffer: AVAudioPCMBuffer) -> ProviderAudioPCMLevelSnapshot {
        guard buffer.format.commonFormat == .pcmFormatFloat32,
              let channelData = buffer.floatChannelData,
              buffer.frameLength > 0 else {
            return ProviderAudioPCMLevelSnapshot(
                averagePowerDBFS: -160,
                peakPowerDBFS: -160
            )
        }

        let frameCount = Int(buffer.frameLength)
        let channelCount = max(1, Int(buffer.format.channelCount))
        var sumSquares: Double = 0
        var peak: Float = 0
        var sampleCount = 0

        if buffer.format.isInterleaved {
            let samples = channelData[0]
            let count = frameCount * channelCount
            for index in 0..<count {
                let sample = samples[index]
                sumSquares += Double(sample * sample)
                peak = max(peak, abs(sample))
            }
            sampleCount = count
        } else {
            for channel in 0..<channelCount {
                let samples = channelData[channel]
                for index in 0..<frameCount {
                    let sample = samples[index]
                    sumSquares += Double(sample * sample)
                    peak = max(peak, abs(sample))
                }
                sampleCount += frameCount
            }
        }

        guard sampleCount > 0 else {
            return ProviderAudioPCMLevelSnapshot(
                averagePowerDBFS: -160,
                peakPowerDBFS: -160
            )
        }
        let rms = Float(sqrt(sumSquares / Double(sampleCount)))
        return ProviderAudioPCMLevelSnapshot(
            averagePowerDBFS: decibels(forLinearAmplitude: rms),
            peakPowerDBFS: decibels(forLinearAmplitude: peak)
        )
    }

    private static func decibels(forLinearAmplitude amplitude: Float) -> Float {
        guard amplitude.isFinite, amplitude > 0 else { return -160 }
        return max(-160, min(0, 20 * log10(amplitude)))
    }
}
