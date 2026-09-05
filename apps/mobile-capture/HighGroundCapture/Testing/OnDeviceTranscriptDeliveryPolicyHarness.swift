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
        for code in [
            "CLOUD_FALLBACK_VERIFIED_SOURCE_REQUIRED",
            "PROCESSING_AUTHORIZATION_REQUIRED",
        ] {
            precondition(
                OnDeviceTranscriptDeliveryPolicy.shouldRetryCloudFallbackReadiness(
                    errorCode: code,
                    completedRetries: 0
                )
            )
            precondition(
                !OnDeviceTranscriptDeliveryPolicy.shouldRetryCloudFallbackReadiness(
                    errorCode: code,
                    completedRetries: 3
                )
            )
        }
        for code in [
            "TRANSCRIPT_CONSENT_REQUIRED",
            "CLOUD_FALLBACK_SOURCE_MISMATCH",
            "CLOUD_FALLBACK_PARTICIPANT_MISMATCH",
            "AUTHENTICATION_REQUIRED",
        ] {
            precondition(
                !OnDeviceTranscriptDeliveryPolicy.shouldRetryCloudFallbackReadiness(
                    errorCode: code,
                    completedRetries: 0
                )
            )
        }
        precondition(
            [0, 1, 2].map(
                OnDeviceTranscriptDeliveryPolicy.cloudFallbackReadinessRetryDelaySeconds(
                    completedRetries:
                )
            ) == [1, 2, 4]
        )
        precondition(
            OnDeviceTranscriptDeliveryPolicy.recognitionDeadlineSeconds(
                sourceDurationSeconds: 30
            ) == 345
        )
        precondition(
            OnDeviceTranscriptDeliveryPolicy.recognitionDeadlineSeconds(
                sourceDurationSeconds: 3_600
            ) == 5_700
        )
        precondition(
            OnDeviceTranscriptDeliveryPolicy.recognitionDeadlineSeconds(
                sourceDurationSeconds: .infinity
            ) == 300
        )
        precondition(
            OnDeviceTranscriptDeliveryPolicy.recognitionDeadlineSeconds(
                sourceDurationSeconds: 24 * 60 * 60
            ) == 21_600
        )
        print("PASS On-device transcript delivery retry policy")
    }
}
