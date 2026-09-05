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
        let shortWindows = OnDeviceTranscriptDeliveryPolicy
            .compatibleRecognitionWindows(sourceDurationSeconds: 54)
        precondition(shortWindows == [OnDeviceTranscriptRecognitionWindow(
            sourceStartSeconds: 0,
            sourceEndSeconds: 54,
            extractionStartSeconds: 0,
            extractionEndSeconds: 54
        )])
        let longWindows = OnDeviceTranscriptDeliveryPolicy
            .compatibleRecognitionWindows(sourceDurationSeconds: 130)
        precondition(longWindows == [
            OnDeviceTranscriptRecognitionWindow(
                sourceStartSeconds: 0,
                sourceEndSeconds: 50,
                extractionStartSeconds: 0,
                extractionEndSeconds: 50
            ),
            OnDeviceTranscriptRecognitionWindow(
                sourceStartSeconds: 50,
                sourceEndSeconds: 100,
                extractionStartSeconds: 49.25,
                extractionEndSeconds: 100
            ),
            OnDeviceTranscriptRecognitionWindow(
                sourceStartSeconds: 100,
                sourceEndSeconds: 130,
                extractionStartSeconds: 99.25,
                extractionEndSeconds: 130
            ),
        ])
        precondition(longWindows[1].owns(relativeStartSeconds: 0.5, relativeEndSeconds: 1.5))
        precondition(!longWindows[1].owns(relativeStartSeconds: 0, relativeEndSeconds: 0.5))
        precondition(
            OnDeviceTranscriptDeliveryPolicy
                .compatibleRecognitionWindows(sourceDurationSeconds: .infinity)
                .isEmpty
        )
        print("PASS On-device transcript delivery retry policy")
    }
}
