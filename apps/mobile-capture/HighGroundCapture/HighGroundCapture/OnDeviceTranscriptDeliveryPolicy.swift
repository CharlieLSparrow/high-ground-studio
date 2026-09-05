import Foundation

struct OnDeviceTranscriptRecognitionWindow: Equatable, Sendable {
    let sourceStartSeconds: Double
    let sourceEndSeconds: Double
    let extractionStartSeconds: Double
    let extractionEndSeconds: Double

    var extractionDurationSeconds: Double {
        max(0, extractionEndSeconds - extractionStartSeconds)
    }

    /// The overlap belongs to exactly one source window. Midpoint ownership
    /// keeps a word or phrase that straddles the seam while preventing the
    /// same recognized phrase from appearing twice in the assembled transcript.
    func owns(relativeStartSeconds: Double, relativeEndSeconds: Double) -> Bool {
        guard relativeStartSeconds.isFinite,
              relativeEndSeconds.isFinite,
              relativeStartSeconds >= 0,
              relativeEndSeconds > relativeStartSeconds else { return false }
        let midpoint = extractionStartSeconds
            + ((relativeStartSeconds + relativeEndSeconds) / 2)
        return midpoint >= sourceStartSeconds
            && midpoint < sourceEndSeconds
    }
}

/// Decides whether attaching a durable local transcript should be retried
/// automatically. Only temporary transport and service-capacity failures are
/// eligible; account, permission, validation, and ownership failures remain
/// visible for a person to resolve instead of creating a retry loop.
enum OnDeviceTranscriptDeliveryPolicy {
    private static let transientCloudFallbackReadinessCodes = [
        "CLOUD_FALLBACK_VERIFIED_SOURCE_REQUIRED",
        "PROCESSING_AUTHORIZATION_REQUIRED",
    ]

    static func shouldRetry(httpStatusCode: Int) -> Bool {
        httpStatusCode == 408
            || httpStatusCode == 425
            || httpStatusCode == 429
            || (500...599).contains(httpStatusCode)
    }

    static func shouldRetry(transportError error: Error) -> Bool {
        let error = error as NSError
        guard error.domain == NSURLErrorDomain else {
            return false
        }
        let code = URLError.Code(rawValue: error.code)
        switch code {
        case .timedOut,
             .cannotFindHost,
             .cannotConnectToHost,
             .networkConnectionLost,
             .dnsLookupFailed,
             .resourceUnavailable,
             .notConnectedToInternet:
            return true
        default:
            return false
        }
    }

    static func shouldRetryCloudFallbackReadiness(
        errorCode: String?,
        completedRetries: Int,
        maximumRetries: Int = 3
    ) -> Bool {
        guard completedRetries >= 0,
              completedRetries < maximumRetries else { return false }
        return transientCloudFallbackReadinessCodes.contains(
            errorCode?.trimmingCharacters(in: .whitespacesAndNewlines)
                .uppercased() ?? ""
        )
    }

    static func cloudFallbackReadinessRetryDelaySeconds(
        completedRetries: Int
    ) -> Double {
        switch max(0, completedRetries) {
        case 0: 1
        case 1: 2
        default: 4
        }
    }

    /// SpeechTranscriber is explicitly designed for long-form meetings and
    /// conversations. A fixed short watchdog incorrectly treats healthy work
    /// on an hour-long source as a provider failure, so the recognition budget
    /// scales with the immutable source duration. The floor still catches a
    /// wedged short note, while the cap prevents a damaged source from holding
    /// the queue forever.
    static func recognitionDeadlineSeconds(
        sourceDurationSeconds: Double
    ) -> Double {
        let duration = sourceDurationSeconds.isFinite
            ? max(0, sourceDurationSeconds)
            : 0
        let minimumBudget = 5 * 60.0
        let finalizationAllowance = 5 * 60.0
        let maximumBudget = 6 * 60 * 60.0
        return min(
            maximumBudget,
            max(minimumBudget, (duration * 1.5) + finalizationAllowance)
        )
    }

    /// SFSpeechRecognizer documents a one-minute request limit. The modern
    /// SpeechTranscriber path does not use these windows; they exist only for
    /// older OS versions and the compatibility fallback. Fifty-second owned
    /// windows leave headroom for the framework limit, while 750 ms of prior
    /// context lets recognition recover words that cross a seam.
    static func compatibleRecognitionWindows(
        sourceDurationSeconds: Double
    ) -> [OnDeviceTranscriptRecognitionWindow] {
        guard sourceDurationSeconds.isFinite,
              sourceDurationSeconds > 0 else { return [] }
        let directRequestLimitSeconds = 55.0
        if sourceDurationSeconds <= directRequestLimitSeconds {
            return [OnDeviceTranscriptRecognitionWindow(
                sourceStartSeconds: 0,
                sourceEndSeconds: sourceDurationSeconds,
                extractionStartSeconds: 0,
                extractionEndSeconds: sourceDurationSeconds
            )]
        }

        let ownedWindowSeconds = 50.0
        let priorContextSeconds = 0.75
        var result: [OnDeviceTranscriptRecognitionWindow] = []
        var sourceStart = 0.0
        while sourceStart < sourceDurationSeconds {
            let sourceEnd = min(sourceDurationSeconds, sourceStart + ownedWindowSeconds)
            result.append(OnDeviceTranscriptRecognitionWindow(
                sourceStartSeconds: sourceStart,
                sourceEndSeconds: sourceEnd,
                extractionStartSeconds: max(0, sourceStart - priorContextSeconds),
                extractionEndSeconds: sourceEnd
            ))
            sourceStart = sourceEnd
        }
        return result
    }
}
