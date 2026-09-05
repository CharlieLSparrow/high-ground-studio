import Foundation

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
}
