import Foundation

/// A creator's explicit quality choice. This is not an optimistic device
/// capability claim: the resolved `AVCaptureDevice.Format` is shown separately
/// and both values are preserved with the immutable source.
enum VideoCaptureQualityIntent: String, Codable, CaseIterable, Identifiable, Sendable {
    case production4K24 = "production-4k-24"
    case production4K30 = "production-4k-30"
    case endurance1080p24 = "endurance-1080p-24"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .production4K24: "4K · 24 fps"
        case .production4K30: "4K · 30 fps"
        case .endurance1080p24: "1080p · 24 fps"
        }
    }

    var shortTitle: String {
        switch self {
        case .production4K24: "4K / 24"
        case .production4K30: "4K / 30"
        case .endurance1080p24: "1080 / 24"
        }
    }

    var detail: String {
        switch self {
        case .production4K24:
            "Episode and YouTube master. Highest detail with a traditional production cadence."
        case .production4K30:
            "Highest detail with smoother motion. Uses more storage and thermal budget."
        case .endurance1080p24:
            "Long-take profile with lower storage and thermal demand."
        }
    }

    nonisolated var requestedFramesPerSecond: Double {
        switch self {
        case .production4K24, .endurance1080p24: 24
        case .production4K30: 30
        }
    }

    nonisolated fileprivate var prefers4K: Bool {
        self != .endurance1080p24
    }
}

struct VideoCaptureFormatCandidate: Equatable, Sendable {
    struct FrameRateRange: Equatable, Sendable {
        let minimum: Double
        let maximum: Double

        nonisolated func contains(_ framesPerSecond: Double) -> Bool {
            minimum <= framesPerSecond && maximum >= framesPerSecond
        }
    }

    let index: Int
    let width: Int
    let height: Int
    let supportedFrameRateRanges: [FrameRateRange]
    let isBinned: Bool

    nonisolated var pixelCount: Int64 { Int64(width) * Int64(height) }

    nonisolated func supports(framesPerSecond: Double) -> Bool {
        supportedFrameRateRanges.contains {
            $0.contains(framesPerSecond)
        }
    }
}

struct VideoCaptureQualityResolution: Equatable, Sendable {
    let candidate: VideoCaptureFormatCandidate
    let framesPerSecond: Double
    let fulfillsIntent: Bool
}

enum VideoCaptureQualityPolicy {
    nonisolated static func resolve(
        _ intent: VideoCaptureQualityIntent,
        candidates: [VideoCaptureFormatCandidate]
    ) -> VideoCaptureQualityResolution? {
        let fps = intent.requestedFramesPerSecond
        let eligible = candidates.filter {
            $0.width >= 1_920
                && $0.height >= 1_080
                && $0.width <= 4_096
                && $0.height <= 2_304
                && $0.supports(framesPerSecond: fps)
        }
        guard !eligible.isEmpty else { return nil }

        let selected: VideoCaptureFormatCandidate?
        if intent.prefers4K {
            selected = eligible.sorted { left, right in
                let leftUHD = left.width == 3_840 && left.height == 2_160
                let rightUHD = right.width == 3_840 && right.height == 2_160
                if leftUHD != rightUHD { return leftUHD }
                let left4K = left.width >= 3_840 && left.height >= 2_160
                let right4K = right.width >= 3_840 && right.height >= 2_160
                if left4K != right4K { return left4K }
                if left.isBinned != right.isBinned { return !left.isBinned }
                if left.pixelCount != right.pixelCount {
                    return left.pixelCount > right.pixelCount
                }
                return left.index < right.index
            }.first
        } else {
            selected = eligible.sorted { left, right in
                let left1080 = left.width == 1_920 && left.height == 1_080
                let right1080 = right.width == 1_920 && right.height == 1_080
                if left1080 != right1080 { return left1080 }
                if left.pixelCount != right.pixelCount {
                    return left.pixelCount < right.pixelCount
                }
                if left.isBinned != right.isBinned { return !left.isBinned }
                return left.index < right.index
            }.first
        }
        guard let selected else { return nil }
        let fulfillsIntent = intent.prefers4K
            ? selected.width >= 3_840 && selected.height >= 2_160
            : selected.width == 1_920 && selected.height == 1_080
        return VideoCaptureQualityResolution(
            candidate: selected,
            framesPerSecond: fps,
            fulfillsIntent: fulfillsIntent
        )
    }
}
