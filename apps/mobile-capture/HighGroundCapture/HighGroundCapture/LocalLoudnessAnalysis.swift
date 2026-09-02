import Foundation

struct LocalRecordingLoudnessProfile: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let algorithm: String
    let standard: String
    let status: String
    let sampleRate: Double
    let channelCount: Int
    let analyzedFrameCount: Int64
    let measurementBlockDurationSeconds: Double
    let measurementBlockStepSeconds: Double
    let measurementBlockCount: Int
    let absoluteGatedBlockCount: Int
    let relativeGatedBlockCount: Int
    let absoluteGateLufs: Double
    let relativeGateLufs: Double?
    let integratedLoudnessLufs: Double?
    let maximumMomentaryLoudnessLufs: Double?
}

/// File-based ITU-R BS.1770-5 programme-loudness measurement for the mono and
/// stereo source layouts Capture records today. It applies K-weighting and the
/// specified overlapping 400 ms, two-stage gated integration. This is not a
/// true-peak meter and deliberately does not infer a mastering target.
struct LocalBS1770LoudnessAnalyzer {
    nonisolated static let algorithm = "itu-r-bs.1770-5-integrated-v1"
    nonisolated static let standard = "ITU-R BS.1770-5"

    private let sampleRate: Double
    private let channelCount: Int
    private let blockFrameCount: Int
    private let stepFrameCount: Int
    private let numerator: [Double]
    private let denominator: [Double]

    private struct FilterHistory {
        var v1 = 0.0
        var v2 = 0.0
        var v3 = 0.0
        var v4 = 0.0

        nonisolated init() {}
    }

    private var filterHistory: [FilterHistory]
    private var energyRing: [Double]
    private var energyRingIndex = 0
    private var energyRingCount = 0
    private var energyRingSum = 0.0
    private var analyzedFrameCount: Int64 = 0
    private var blockEnergies: [Double] = []

    nonisolated init?(sampleRate: Double, channelCount: Int) {
        guard sampleRate.isFinite,
              sampleRate >= 16,
              sampleRate <= 768_000,
              channelCount == 1 || channelCount == 2 else { return nil }
        self.sampleRate = sampleRate
        self.channelCount = channelCount
        blockFrameCount = max(1, Int((sampleRate * 0.4).rounded()))
        stepFrameCount = max(1, Int((sampleRate * 0.1).rounded()))

        // Bilinear-transform parameters used to retain the BS.1770
        // K-weighting response across source sample rates. At 48 kHz these
        // resolve to the coefficients printed in Tables 1 and 2.
        var f0 = 1_681.974450955533
        var quality = 0.7071752369554196
        let gain = 3.999843853973347
        var k = tan(.pi * f0 / sampleRate)
        let highGain = pow(10, gain / 20)
        let bandGain = pow(highGain, 0.4996667741545416)
        let shelfA0 = 1 + k / quality + k * k
        let shelfB = [
            (highGain + bandGain * k / quality + k * k) / shelfA0,
            2 * (k * k - highGain) / shelfA0,
            (highGain - bandGain * k / quality + k * k) / shelfA0,
        ]
        let shelfA = [
            1.0,
            2 * (k * k - 1) / shelfA0,
            (1 - k / quality + k * k) / shelfA0,
        ]

        f0 = 38.13547087602444
        quality = 0.5003270373238773
        k = tan(.pi * f0 / sampleRate)
        let highPassA0 = 1 + k / quality + k * k
        let highPassB = [1.0, -2.0, 1.0]
        let highPassA = [
            1.0,
            2 * (k * k - 1) / highPassA0,
            (1 - k / quality + k * k) / highPassA0,
        ]

        numerator = Self.convolve(shelfB, highPassB)
        denominator = Self.convolve(shelfA, highPassA)
        filterHistory = Array(repeating: FilterHistory(), count: channelCount)
        energyRing = Array(repeating: 0, count: blockFrameCount)
        blockEnergies.reserveCapacity(1_200)
    }

    nonisolated mutating func consume(
        planarFloatChannels channels: UnsafePointer<UnsafeMutablePointer<Float>>,
        frameCount: Int
    ) {
        guard frameCount > 0 else { return }
        for frameIndex in 0..<frameCount {
            var frameEnergy = 0.0
            for channelIndex in 0..<channelCount {
                frameEnergy += filteredSample(
                    Double(channels[channelIndex][frameIndex]),
                    channelIndex: channelIndex
                ).squared
            }
            append(frameEnergy: frameEnergy)
        }
    }

    nonisolated func result() -> LocalRecordingLoudnessProfile {
        let absoluteGate = -70.0
        let absoluteGated = blockEnergies.filter {
            Self.energyToLoudness($0) >= absoluteGate
        }
        guard !absoluteGated.isEmpty else {
            return profile(
                status: blockEnergies.isEmpty ? "insufficient-duration" : "below-absolute-gate",
                absoluteGatedBlockCount: 0,
                relativeGatedBlockCount: 0,
                relativeGateLufs: nil,
                integratedLoudnessLufs: nil
            )
        }

        let absoluteGatedMean = absoluteGated.reduce(0, +)
            / Double(absoluteGated.count)
        let relativeGateEnergy = absoluteGatedMean * 0.1
        let relativeGateLufs = Self.energyToLoudness(relativeGateEnergy)
        let relativeGated = absoluteGated.filter {
            $0 >= relativeGateEnergy
        }
        guard !relativeGated.isEmpty else {
            return profile(
                status: "below-relative-gate",
                absoluteGatedBlockCount: absoluteGated.count,
                relativeGatedBlockCount: 0,
                relativeGateLufs: relativeGateLufs,
                integratedLoudnessLufs: nil
            )
        }
        let integratedEnergy = relativeGated.reduce(0, +)
            / Double(relativeGated.count)
        return profile(
            status: "measured",
            absoluteGatedBlockCount: absoluteGated.count,
            relativeGatedBlockCount: relativeGated.count,
            relativeGateLufs: relativeGateLufs,
            integratedLoudnessLufs: Self.energyToLoudness(integratedEnergy)
        )
    }

    nonisolated private mutating func filteredSample(
        _ sample: Double,
        channelIndex: Int
    ) -> Double {
        var history = filterHistory[channelIndex]
        var current = sample
            - denominator[1] * history.v1
            - denominator[2] * history.v2
            - denominator[3] * history.v3
            - denominator[4] * history.v4
        let output = numerator[0] * current
            + numerator[1] * history.v1
            + numerator[2] * history.v2
            + numerator[3] * history.v3
            + numerator[4] * history.v4
        if abs(current) < 1e-300 { current = 0 }
        history.v4 = history.v3
        history.v3 = history.v2
        history.v2 = history.v1
        history.v1 = current
        filterHistory[channelIndex] = history
        return output
    }

    nonisolated private mutating func append(frameEnergy: Double) {
        if energyRingCount == blockFrameCount {
            energyRingSum -= energyRing[energyRingIndex]
        } else {
            energyRingCount += 1
        }
        energyRing[energyRingIndex] = frameEnergy
        energyRingSum += frameEnergy
        energyRingIndex = (energyRingIndex + 1) % blockFrameCount
        analyzedFrameCount += 1

        guard energyRingCount == blockFrameCount else { return }
        let framesAfterFirstBlock = Int(analyzedFrameCount) - blockFrameCount
        guard framesAfterFirstBlock % stepFrameCount == 0 else { return }
        blockEnergies.append(max(0, energyRingSum / Double(blockFrameCount)))
    }

    nonisolated private func profile(
        status: String,
        absoluteGatedBlockCount: Int,
        relativeGatedBlockCount: Int,
        relativeGateLufs: Double?,
        integratedLoudnessLufs: Double?
    ) -> LocalRecordingLoudnessProfile {
        LocalRecordingLoudnessProfile(
            schemaVersion: 1,
            algorithm: Self.algorithm,
            standard: Self.standard,
            status: status,
            sampleRate: sampleRate,
            channelCount: channelCount,
            analyzedFrameCount: analyzedFrameCount,
            measurementBlockDurationSeconds: 0.4,
            measurementBlockStepSeconds: 0.1,
            measurementBlockCount: blockEnergies.count,
            absoluteGatedBlockCount: absoluteGatedBlockCount,
            relativeGatedBlockCount: relativeGatedBlockCount,
            absoluteGateLufs: -70,
            relativeGateLufs: relativeGateLufs.map(Self.rounded),
            integratedLoudnessLufs: integratedLoudnessLufs.map(Self.rounded),
            maximumMomentaryLoudnessLufs: blockEnergies.max()
                .map(Self.energyToLoudness)
                .map(Self.rounded)
        )
    }

    nonisolated private static func energyToLoudness(_ energy: Double) -> Double {
        guard energy > 0 else { return -.infinity }
        return -0.691 + 10 * log10(energy)
    }

    nonisolated private static func convolve(_ left: [Double], _ right: [Double]) -> [Double] {
        var result = Array(
            repeating: 0.0,
            count: left.count + right.count - 1
        )
        for leftIndex in left.indices {
            for rightIndex in right.indices {
                result[leftIndex + rightIndex] += left[leftIndex] * right[rightIndex]
            }
        }
        return result
    }

    nonisolated private static func rounded(_ value: Double) -> Double {
        guard value.isFinite else { return value }
        return (value * 1_000).rounded() / 1_000
    }
}

private extension Double {
    nonisolated var squared: Double { self * self }
}
