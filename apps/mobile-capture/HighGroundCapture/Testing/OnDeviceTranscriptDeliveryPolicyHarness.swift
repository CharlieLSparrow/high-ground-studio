import Foundation

@main
struct OnDeviceTranscriptDeliveryPolicyHarness {
    static func main() {
        let retryableStatuses = [408, 425, 429, 500, 503, 599]
        let permanentStatuses = [200, 400, 401, 403, 404, 409, 422, 600]
        precondition(
            retryableStatuses.allSatisfy(
                OnDeviceTranscriptDeliveryPolicy.shouldRetry(httpStatusCode:)
            )
        )
        precondition(
            permanentStatuses.allSatisfy {
                !OnDeviceTranscriptDeliveryPolicy.shouldRetry(httpStatusCode: $0)
            }
        )

        let retryableTransportCodes: [URLError.Code] = [
            .timedOut,
            .cannotFindHost,
            .cannotConnectToHost,
            .networkConnectionLost,
            .dnsLookupFailed,
            .resourceUnavailable,
            .notConnectedToInternet,
        ]
        precondition(retryableTransportCodes.allSatisfy { code in
            OnDeviceTranscriptDeliveryPolicy.shouldRetry(
                transportError: URLError(code)
            )
        })
        precondition(
            !OnDeviceTranscriptDeliveryPolicy.shouldRetry(
                transportError: URLError(.userAuthenticationRequired)
            )
        )
        precondition(
            !OnDeviceTranscriptDeliveryPolicy.shouldRetry(
                transportError: NSError(
                    domain: "QuipslyValidation",
                    code: 503
                )
            )
        )
        print("PASS On-device transcript delivery retry policy")
    }
}
