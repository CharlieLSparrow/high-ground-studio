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

private func summary(
    average: Float,
    peak: Float,
    nearFullScale: Int = 0,
    observations: Int = 20,
    route: String = "Shure MV7i"
) -> CaptureAudioSoundCheckSummary {
    CaptureAudioSoundCheckSummary.evaluate(
        duration: 10,
        averagePowerDBFS: average,
        peakPowerDBFS: peak,
        nearFullScaleObservationCount: nearFullScale,
        observationCount: observations,
        routeName: route,
        createdAt: Date(timeIntervalSince1970: 1_786_000_000)
    )
}

@main
struct CaptureAudioSoundCheckModelHarness {
    static func main() {
        require(
            summary(average: -.infinity, peak: -.infinity, observations: 0).health
                == .noSignal,
            "zero observations must remain no-signal evidence"
        )
        require(
            summary(average: -70, peak: -52).health == .tooQuiet,
            "very low speech must be classified as too quiet"
        )
        require(
            summary(average: -24, peak: -9).health == .healthy,
            "speech with useful headroom must be classified as healthy"
        )
        require(
            summary(average: -11.5, peak: -5).health == .hot,
            "high average power must be classified as hot even before clipping"
        )
        require(
            summary(average: -20, peak: -2.5).health == .hot,
            "a peak inside the three-decibel headroom boundary must be hot"
        )
        require(
            summary(average: -18, peak: -0.8).health == .clippingRisk,
            "near-full-scale peak evidence must be a clipping risk"
        )
        require(
            summary(average: -22, peak: -8, nearFullScale: 1).health
                == .clippingRisk,
            "any observed near-full-scale window must survive later quieter windows"
        )

        let normalized = CaptureAudioSoundCheckSummary.evaluate(
            duration: -4,
            averagePowerDBFS: .nan,
            peakPowerDBFS: 12,
            nearFullScaleObservationCount: -2,
            observationCount: -5,
            routeName: "  iPhone microphone  "
        )
        require(normalized.duration == 0, "duration must never be negative")
        require(normalized.averagePowerDBFS == -160, "non-finite power must fail closed")
        require(normalized.peakPowerDBFS == 0, "power above full scale must clamp to zero")
        require(normalized.nearFullScaleObservationCount == 0, "observation counts must never be negative")
        require(normalized.observationCount == 0, "observation counts must never be negative")
        require(normalized.health == .noSignal, "invalid observation evidence must fail closed")
        require(normalized.routeName == "iPhone microphone", "route identity must be normalized")
        require(
            CaptureAudioSoundCheckHealth.healthy.guidance.contains("Listen back"),
            "healthy electrical level must still require human listen-back"
        )

        print("PASS Capture audio sound-check classifications preserve headroom, route, and listen-back truth.")
    }
}
