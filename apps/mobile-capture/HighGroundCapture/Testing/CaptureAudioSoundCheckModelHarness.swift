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
        require(normalized.sampleRateHz == 48_000, "the encoded source rate must stay explicit")
        require(normalized.channelCount == 1, "the encoded source channel count must stay explicit")
        require(normalized.health == .noSignal, "invalid observation evidence must fail closed")
        require(normalized.routeName == "iPhone microphone", "route identity must be normalized")
        require(
            CaptureAudioSoundCheckHealth.healthy.guidance.contains("Listen back"),
            "healthy electrical level must still require human listen-back"
        )
        require(
            CaptureAudioSoundCheckPrompt.forRemainingSeconds(10).heading
                .contains("normal voice"),
            "the check must begin with representative normal speech"
        )
        require(
            CaptureAudioSoundCheckPrompt.forRemainingSeconds(7).heading
                .contains("loudest likely sentence"),
            "the check must include expected emphasis before its peak reading"
        )
        require(
            CaptureAudioSoundCheckPrompt.forRemainingSeconds(4).detail
                .contains("plosives"),
            "the check must explain its plosive-heavy listen-back phrase"
        )
        require(
            CaptureAudioSoundCheckPrompt.forRemainingSeconds(2).heading
                .contains("stay quiet"),
            "the check must include a quiet tail for room and routing review"
        )
        require(
            CaptureAudioSoundCheckPrompt.forRemainingSeconds(.nan).heading
                .contains("normal voice"),
            "invalid timer evidence must return to the safe first prompt"
        )
        require(
            CaptureAudioLiveInputState.evaluate(
                averagePowerDBFS: -160,
                peakPowerDBFS: -160,
                isActive: false
            ) == .inactive,
            "an idle recorder must never claim missing input"
        )
        require(
            CaptureAudioLiveInputState.evaluate(
                averagePowerDBFS: -72,
                peakPowerDBFS: -59,
                isActive: true
            ) == .noUsefulSignal,
            "a continuing flat recorder route must be visible as no useful signal"
        )
        require(
            CaptureAudioLiveInputState.evaluate(
                averagePowerDBFS: -48,
                peakPowerDBFS: -35,
                isActive: true
            ) == .low,
            "quiet but responsive input must remain distinct from a flat route"
        )
        require(
            CaptureAudioLiveInputState.evaluate(
                averagePowerDBFS: -24,
                peakPowerDBFS: -9,
                isActive: true
            ) == .healthy,
            "ordinary speech must remain in the healthy live range"
        )
        require(
            CaptureAudioLiveInputState.evaluate(
                averagePowerDBFS: -11,
                peakPowerDBFS: -5,
                isActive: true
            ) == .hot,
            "high live average level must retain a headroom warning"
        )
        require(
            CaptureAudioLiveInputState.evaluate(
                averagePowerDBFS: -20,
                peakPowerDBFS: -0.5,
                isActive: true
            ) == .clippingRisk,
            "near-full-scale live peaks must retain a clipping warning"
        )

        do {
            let original = summary(average: -24, peak: -9)
            let encoded = try JSONEncoder().encode(original)
            let decoded = try JSONDecoder().decode(
                CaptureAudioSoundCheckSummary.self,
                from: encoded
            )
            require(decoded == original, "sound-check evidence must survive the protected outbox boundary")
            require(
                CaptureAudioSoundCheckPlaybackDecision.heardClear.rawValue == "HEARD_CLEAR",
                "a positive listen-back must match the server contract exactly"
            )
            require(
                CaptureAudioSoundCheckPlaybackDecision.needsAdjustment.rawValue == "NEEDS_ADJUSTMENT",
                "a listening concern must match the server contract exactly"
            )
        } catch {
            fputs("FAIL sound-check evidence could not be encoded: \(error)\n", stderr)
            exit(1)
        }

        print("PASS Capture audio sound-check and live-input classifications preserve headroom, route, explicit listener decisions, and outbox evidence.")
    }
}
