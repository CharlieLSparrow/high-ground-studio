import Foundation

enum CaptureAudioSoundCheckHealth: String, Codable, Sendable {
    case noSignal
    case tooQuiet
    case healthy
    case hot
    case clippingRisk

    var title: String {
        switch self {
        case .noSignal: "No useful signal"
        case .tooQuiet: "Input is too quiet"
        case .healthy: "Speech level looks usable"
        case .hot: "Input is running hot"
        case .clippingRisk: "Clipping risk"
        }
    }

    var guidance: String {
        switch self {
        case .noSignal:
            "Check the selected microphone, interface routing, mute switches, and input channel before the take."
        case .tooQuiet:
            "Move closer or raise input gain gradually, then run the check again. Avoid rescuing a very quiet source later with heavy gain."
        case .healthy:
            "The observed electrical level leaves useful headroom. Listen back for mouth noise, room sound, clothing rub, and monitoring bleed before recording."
        case .hot:
            "Lower input gain or increase microphone distance slightly. Sudden laughter and emphasis still need headroom."
        case .clippingRisk:
            "Lower input gain before recording. Samples near digital full scale cannot be repaired reliably after capture."
        }
    }
}

enum CaptureAudioSoundCheckPlaybackDecision: String, Codable, Equatable, Sendable {
    case heardClear = "HEARD_CLEAR"
    case needsAdjustment = "NEEDS_ADJUSTMENT"

    var title: String {
        switch self {
        case .heardClear: "I heard a clear setup"
        case .needsAdjustment: "I heard something to adjust"
        }
    }
}

struct CaptureAudioSoundCheckPrompt: Equatable, Sendable {
    let heading: String
    let detail: String

    static func forRemainingSeconds(_ remainingSeconds: TimeInterval) -> Self {
        guard remainingSeconds.isFinite, remainingSeconds <= 7 else {
            return Self(
                heading: "Use your normal voice",
                detail: "Speak at the distance and energy you expect during the Session."
            )
        }
        if remainingSeconds > 4 {
            return Self(
                heading: "Try your loudest likely sentence",
                detail: "This checks whether ordinary emphasis still has headroom."
            )
        }
        if remainingSeconds > 2 {
            return Self(
                heading: "Say: Better conversations put people first",
                detail: "The B and P sounds make plosives and close-mic technique easier to hear on playback."
            )
        }
        return Self(
            heading: "Pause and stay quiet",
            detail: "Listen back for room echo, fans, hiss, hum, or an unexpected open microphone."
        )
    }
}

struct CaptureAudioSoundCheckSummary: Codable, Equatable, Sendable {
    static let clippingRiskPeakDBFS: Float = -1
    static let hotPeakDBFS: Float = -3
    static let hotAverageDBFS: Float = -12
    static let quietPeakDBFS: Float = -36
    static let quietAverageDBFS: Float = -48

    let duration: TimeInterval
    let averagePowerDBFS: Float
    let peakPowerDBFS: Float
    let nearFullScaleObservationCount: Int
    let observationCount: Int
    let sampleRateHz: Int
    let channelCount: Int
    let routeName: String
    let createdAt: Date
    let health: CaptureAudioSoundCheckHealth

    static func evaluate(
        duration: TimeInterval,
        averagePowerDBFS: Float,
        peakPowerDBFS: Float,
        nearFullScaleObservationCount: Int,
        observationCount: Int,
        sampleRateHz: Int = 48_000,
        channelCount: Int = 1,
        routeName: String,
        createdAt: Date = Date()
    ) -> CaptureAudioSoundCheckSummary {
        let safeAverage = normalizedDecibels(averagePowerDBFS)
        let safePeak = normalizedDecibels(peakPowerDBFS)
        let safeNearFullScaleObservationCount = max(
            0,
            nearFullScaleObservationCount
        )
        let safeObservationCount = max(0, observationCount)
        let health: CaptureAudioSoundCheckHealth
        if safeObservationCount == 0 || safePeak <= -120 {
            health = .noSignal
        } else if safeNearFullScaleObservationCount > 0
                    || safePeak >= clippingRiskPeakDBFS {
            health = .clippingRisk
        } else if safePeak >= hotPeakDBFS || safeAverage >= hotAverageDBFS {
            health = .hot
        } else if safePeak < quietPeakDBFS && safeAverage < quietAverageDBFS {
            health = .tooQuiet
        } else {
            health = .healthy
        }
        return CaptureAudioSoundCheckSummary(
            duration: max(0, duration),
            averagePowerDBFS: safeAverage,
            peakPowerDBFS: safePeak,
            nearFullScaleObservationCount: safeNearFullScaleObservationCount,
            observationCount: safeObservationCount,
            sampleRateHz: max(1, sampleRateHz),
            channelCount: max(1, channelCount),
            routeName: routeName.trimmingCharacters(in: .whitespacesAndNewlines),
            createdAt: createdAt,
            health: health
        )
    }

    private static func normalizedDecibels(_ value: Float) -> Float {
        guard value.isFinite else { return -160 }
        return min(0, max(-160, value))
    }
}
