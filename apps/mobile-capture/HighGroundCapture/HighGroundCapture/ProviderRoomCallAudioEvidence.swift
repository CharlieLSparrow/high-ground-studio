import Foundation

enum ProviderRoomCallAudioHealth: String, Equatable, Sendable {
    case checking
    case muted
    case noSignal
    case tooQuiet
    case healthy
    case hot
    case clippingRisk
    case needsAttention

    var title: String {
        switch self {
        case .checking: "Checking microphone"
        case .muted: "Microphone muted"
        case .noSignal: "No microphone signal"
        case .tooQuiet: "Microphone is low"
        case .healthy: "Microphone sounds healthy"
        case .hot: "Microphone is loud"
        case .clippingRisk: "Microphone may clip"
        case .needsAttention: "Microphone needs attention"
        }
    }

    var detail: String? {
        switch self {
        case .checking:
            nil
        case .muted:
            nil
        case .noSignal:
            "Speak once. If this stays silent, check the selected microphone or its mute switch."
        case .tooQuiet:
            "Move closer or raise input gain a little."
        case .healthy:
            nil
        case .hot:
            "Lower input gain or move back slightly so louder moments have room."
        case .clippingRisk:
            "Lower input gain before continuing; clipped speech cannot be restored reliably."
        case .needsAttention:
            "Quipsly stopped receiving microphone levels. Check the input or reconnect."
        }
    }

    var systemImage: String {
        switch self {
        case .checking: "waveform"
        case .muted: "mic.slash.fill"
        case .healthy: "checkmark.circle.fill"
        case .noSignal, .tooQuiet, .hot, .clippingRisk, .needsAttention:
            "exclamationmark.triangle.fill"
        }
    }

    var needsVisibleGuidance: Bool {
        detail != nil
    }
}

/// Resolves one conventional call-level signal for ordinary participants.
/// Exact dBFS evidence stays available to diagnostics, but the primary call UI
/// intentionally uses plain language and never implies that metering is a
/// recording action.
enum ProviderRoomCallAudioEvidence {
    static let staleInputInterval: TimeInterval = 1.5

    static func resolve(
        isConnected: Bool,
        isMuted: Bool,
        averagePowerDBFS: Float,
        peakPowerDBFS: Float,
        receivedPCMAt: Date?,
        now: Date = Date()
    ) -> ProviderRoomCallAudioHealth {
        guard isConnected else { return .checking }
        guard !isMuted else { return .muted }
        guard let receivedPCMAt else { return .checking }
        guard now.timeIntervalSince(receivedPCMAt) <= staleInputInterval else {
            return .needsAttention
        }

        let summary = CaptureAudioSoundCheckSummary.evaluate(
            duration: 0,
            averagePowerDBFS: averagePowerDBFS,
            peakPowerDBFS: peakPowerDBFS,
            nearFullScaleObservationCount: peakPowerDBFS >= CaptureAudioSoundCheckSummary.clippingRiskPeakDBFS ? 1 : 0,
            observationCount: 1,
            routeName: "Live call microphone",
            createdAt: receivedPCMAt
        )
        switch summary.health {
        case .noSignal: return .noSignal
        case .tooQuiet: return .tooQuiet
        case .healthy: return .healthy
        case .hot: return .hot
        case .clippingRisk: return .clippingRisk
        }
    }
}
