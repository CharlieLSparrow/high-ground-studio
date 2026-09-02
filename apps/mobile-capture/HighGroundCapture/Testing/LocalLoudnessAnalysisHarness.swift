import Foundation

private func require(
    _ condition: @autoclosure () -> Bool,
    _ message: String
) {
    guard condition() else {
        fputs("FAIL \(message)\n", stderr)
        exit(1)
    }
}

private struct ToneSegment {
    let durationSeconds: Double
    let peakDbfs: Double?
}

private func analyzeStereoTone(
    sampleRate: Double,
    frequency: Double = 1_000,
    segments: [ToneSegment]
) -> LocalRecordingLoudnessProfile {
    var analyzer = LocalBS1770LoudnessAnalyzer(
        sampleRate: sampleRate,
        channelCount: 2
    )!
    let chunkCapacity = 4_096
    let left = UnsafeMutablePointer<Float>.allocate(capacity: chunkCapacity)
    let right = UnsafeMutablePointer<Float>.allocate(capacity: chunkCapacity)
    defer {
        left.deallocate()
        right.deallocate()
    }
    let pointers = [left, right]
    var absoluteFrame = 0
    for segment in segments {
        var remaining = Int((segment.durationSeconds * sampleRate).rounded())
        let amplitude = segment.peakDbfs.map { pow(10, $0 / 20) } ?? 0
        while remaining > 0 {
            let chunkFrames = min(chunkCapacity, remaining)
            for index in 0..<chunkFrames {
                let phase = 2 * Double.pi * frequency
                    * Double(absoluteFrame + index) / sampleRate
                let sample = Float(amplitude * sin(phase))
                left[index] = sample
                right[index] = sample
            }
            pointers.withUnsafeBufferPointer { pointerBuffer in
                analyzer.consume(
                    planarFloatChannels: pointerBuffer.baseAddress!,
                    frameCount: chunkFrames
                )
            }
            absoluteFrame += chunkFrames
            remaining -= chunkFrames
        }
    }
    return analyzer.result()
}

private func within(
    _ value: Double?,
    _ expected: Double,
    tolerance: Double = 0.1
) -> Bool {
    guard let value else { return false }
    return abs(value - expected) <= tolerance
}

@main
struct LocalLoudnessAnalysisHarness {
    static func main() throws {
        let calibration = analyzeStereoTone(
            sampleRate: 48_000,
            segments: [.init(durationSeconds: 20, peakDbfs: -23)]
        )
        require(calibration.status == "measured", "calibration tone should produce a measurement")
        require(
            within(calibration.integratedLoudnessLufs, -23),
            "EBU test case 1 should read -23.0 ±0.1 LUFS, got \(String(describing: calibration.integratedLoudnessLufs))"
        )
        require(
            within(calibration.maximumMomentaryLoudnessLufs, -23),
            "the constant calibration tone should keep maximum momentary loudness at -23 LUFS"
        )
        require(calibration.measurementBlockCount == 197, "20 seconds should yield 197 complete 400 ms blocks at 75% overlap")

        let relativeGate = analyzeStereoTone(
            sampleRate: 48_000,
            segments: [
                .init(durationSeconds: 10, peakDbfs: -36),
                .init(durationSeconds: 60, peakDbfs: -23),
                .init(durationSeconds: 10, peakDbfs: -36),
            ]
        )
        require(
            within(relativeGate.integratedLoudnessLufs, -23),
            "EBU test case 3 should gate quieter bookends and read -23.0 ±0.1 LUFS"
        )
        require(
            relativeGate.relativeGatedBlockCount < relativeGate.absoluteGatedBlockCount,
            "the relative gate should exclude the quieter bookends"
        )

        let absoluteGate = analyzeStereoTone(
            sampleRate: 48_000,
            segments: [
                .init(durationSeconds: 10, peakDbfs: -72),
                .init(durationSeconds: 10, peakDbfs: -36),
                .init(durationSeconds: 60, peakDbfs: -23),
                .init(durationSeconds: 10, peakDbfs: -36),
                .init(durationSeconds: 10, peakDbfs: -72),
            ]
        )
        require(
            within(absoluteGate.integratedLoudnessLufs, -23),
            "EBU test case 4 should apply both gates and read -23.0 ±0.1 LUFS"
        )
        require(
            absoluteGate.absoluteGatedBlockCount < absoluteGate.measurementBlockCount,
            "the -72 dBFS regions should fall below the absolute gate"
        )

        let alternateRate = analyzeStereoTone(
            sampleRate: 44_100,
            segments: [.init(durationSeconds: 20, peakDbfs: -23)]
        )
        require(
            within(alternateRate.integratedLoudnessLufs, -23),
            "sample-rate-derived K-weighting should retain calibration at 44.1 kHz"
        )

        let tooShort = analyzeStereoTone(
            sampleRate: 48_000,
            segments: [.init(durationSeconds: 0.2, peakDbfs: -23)]
        )
        require(tooShort.status == "insufficient-duration", "partial 400 ms blocks must be discarded")
        require(tooShort.integratedLoudnessLufs == nil, "insufficient audio must not invent programme loudness")

        let encoded = try JSONEncoder().encode(calibration)
        let decoded = try JSONDecoder().decode(
            LocalRecordingLoudnessProfile.self,
            from: encoded
        )
        require(decoded == calibration, "the measurement must survive the source-metadata JSON boundary")

        print("PASS Local loudness analysis matches EBU synthetic programme-loudness cases at 48 and 44.1 kHz.")
    }
}
