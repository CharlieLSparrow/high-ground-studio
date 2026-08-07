import Foundation

@main
enum VideoCaptureQualityPolicyTests {
    static func main() {
        production24PrefersUnbinned4K()
        production30RejectsA24OnlyFormat()
        enduranceUsesExact1080InsteadOf4K()
        productionFallbackIsVisible()
        unsupportedCadenceFailsClosed()
        disjointRangesDoNotInventCadence()
        uhdWinsOverLarger4K()
        print("PASS 7 video capture quality-policy tests")
    }

    private static let formats = [
        candidate(0, 1_920, 1_080, 24, 60, false),
        candidate(1, 3_840, 2_160, 24, 30, true),
        candidate(2, 3_840, 2_160, 24, 30, false),
        candidate(3, 4_096, 2_304, 30, 60, false),
    ]

    private static func production24PrefersUnbinned4K() {
        let result = VideoCaptureQualityPolicy.resolve(.production4K24, candidates: formats)
        expect(result?.candidate.index == 2, "4K/24 should prefer an unbinned 4K format")
        expect(result?.framesPerSecond == 24, "4K/24 must preserve the requested cadence")
        expect(result?.fulfillsIntent == true, "a 4K/24 format should fulfill the intent")
    }

    private static func production30RejectsA24OnlyFormat() {
        let candidates = [
            candidate(0, 3_840, 2_160, 24, 24, false),
            candidate(1, 3_840, 2_160, 30, 30, false),
        ]
        let result = VideoCaptureQualityPolicy.resolve(.production4K30, candidates: candidates)
        expect(result?.candidate.index == 1, "4K/30 must use a format that advertises 30 fps")
    }

    private static func enduranceUsesExact1080InsteadOf4K() {
        let result = VideoCaptureQualityPolicy.resolve(.endurance1080p24, candidates: formats)
        expect(result?.candidate.index == 0, "endurance should choose exact 1080p over a larger source")
        expect(result?.fulfillsIntent == true, "exact 1080p/24 should fulfill endurance intent")
    }

    private static func productionFallbackIsVisible() {
        let result = VideoCaptureQualityPolicy.resolve(
            .production4K24,
            candidates: [candidate(0, 1_920, 1_080, 24, 30, false)]
        )
        expect(result?.candidate.index == 0, "a 24 fps fallback should remain usable")
        expect(result?.fulfillsIntent == false, "1080p must not be described as fulfilled 4K")
    }

    private static func unsupportedCadenceFailsClosed() {
        let result = VideoCaptureQualityPolicy.resolve(
            .production4K24,
            candidates: [candidate(0, 3_840, 2_160, 30, 60, false)]
        )
        expect(result == nil, "Quipsly must not silently turn a 24 fps choice into 30 fps")
    }

    private static func disjointRangesDoNotInventCadence() {
        let format = VideoCaptureFormatCandidate(
            index: 0,
            width: 3_840,
            height: 2_160,
            supportedFrameRateRanges: [
                .init(minimum: 24, maximum: 24),
                .init(minimum: 60, maximum: 60),
            ],
            isBinned: false
        )
        let result = VideoCaptureQualityPolicy.resolve(
            .production4K30,
            candidates: [format]
        )
        expect(result == nil, "disjoint ranges must not invent 30 fps support")
    }

    private static func uhdWinsOverLarger4K() {
        let candidates = [
            candidate(0, 4_096, 2_304, 24, 30, false),
            candidate(1, 3_840, 2_160, 24, 30, false),
        ]
        let result = VideoCaptureQualityPolicy.resolve(
            .production4K24,
            candidates: candidates
        )
        expect(result?.candidate.index == 1, "UHD should win for editor and platform interoperability")
    }

    private static func candidate(
        _ index: Int,
        _ width: Int,
        _ height: Int,
        _ minimum: Double,
        _ maximum: Double,
        _ binned: Bool
    ) -> VideoCaptureFormatCandidate {
        VideoCaptureFormatCandidate(
            index: index,
            width: width,
            height: height,
            supportedFrameRateRanges: [
                .init(minimum: minimum, maximum: maximum),
            ],
            isBinned: binned
        )
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else { fatalError("FAIL \(message)") }
    }
}
