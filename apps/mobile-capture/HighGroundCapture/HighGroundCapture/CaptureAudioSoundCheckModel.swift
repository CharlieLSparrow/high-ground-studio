import Foundation

enum CaptureAudioSoundCheckHealth: String, Sendable {
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

struct CaptureAudioSoundCheckSummary: Equatable, Sendable {
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
    let routeName: String
    let createdAt: Date
    let health: CaptureAudioSoundCheckHealth

    static func evaluate(
        duration: TimeInterval,
        averagePowerDBFS: Float,
        peakPowerDBFS: Float,
        nearFullScaleObservationCount: Int,
        observationCount: Int,
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
