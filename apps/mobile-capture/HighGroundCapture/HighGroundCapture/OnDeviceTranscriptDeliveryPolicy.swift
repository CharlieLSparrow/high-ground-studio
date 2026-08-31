import Foundation

/// Decides whether attaching a durable local transcript should be retried
/// automatically. Only temporary transport and service-capacity failures are
/// eligible; account, permission, validation, and ownership failures remain
/// visible for a person to resolve instead of creating a retry loop.
enum OnDeviceTranscriptDeliveryPolicy {
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
}
