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
            OnDeviceTranscriptDeliveryPolicy
                .shouldRecoverLocallyAfterPermissionChange(
                    fallbackReasonCode: " apple-speech-permission-denied ",
                    cloudFallbackWasAccepted: false,
                    cloudFallbackStatus: nil,
                    speechRecognitionIsAuthorized: true,
                    localSourceIsAvailable: true,
                    sourceNeedsClearSpeechRetry: false
                )
        )
        precondition(
            !OnDeviceTranscriptDeliveryPolicy
                .shouldRecoverLocallyAfterPermissionChange(
                    fallbackReasonCode: "apple-speech-processing-failed",
                    cloudFallbackWasAccepted: false,
                    cloudFallbackStatus: nil,
                    speechRecognitionIsAuthorized: true,
                    localSourceIsAvailable: true,
                    sourceNeedsClearSpeechRetry: false
                )
        )
        precondition(
            OnDeviceTranscriptDeliveryPolicy
                .shouldRecoverLocallyAfterPermissionChange(
                    fallbackReasonCode: "apple-speech-permission-denied",
                    cloudFallbackWasAccepted: true,
                    cloudFallbackStatus: "FAILED",
                    speechRecognitionIsAuthorized: true,
                    localSourceIsAvailable: true,
                    sourceNeedsClearSpeechRetry: false
                )
        )
        precondition(
            OnDeviceTranscriptDeliveryPolicy
                .shouldRecoverLocallyAfterPermissionChange(
                    fallbackReasonCode: "apple-speech-permission-denied",
                    cloudFallbackWasAccepted: true,
                    cloudFallbackStatus: " held ",
                    speechRecognitionIsAuthorized: true,
                    localSourceIsAvailable: true,
                    sourceNeedsClearSpeechRetry: false
                )
        )
        for activeStatus in [nil, "QUEUED", "RUNNING", "COMPLETED"] as [String?] {
            precondition(
                !OnDeviceTranscriptDeliveryPolicy
                    .shouldRecoverLocallyAfterPermissionChange(
                        fallbackReasonCode: "apple-speech-permission-denied",
                        cloudFallbackWasAccepted: true,
                        cloudFallbackStatus: activeStatus,
                        speechRecognitionIsAuthorized: true,
                        localSourceIsAvailable: true,
                        sourceNeedsClearSpeechRetry: false
                    )
            )
        }
        precondition(
            !OnDeviceTranscriptDeliveryPolicy
                .shouldRecoverLocallyAfterPermissionChange(
                    fallbackReasonCode: "apple-speech-permission-denied",
                    cloudFallbackWasAccepted: false,
                    cloudFallbackStatus: nil,
                    speechRecognitionIsAuthorized: false,
                    localSourceIsAvailable: true,
                    sourceNeedsClearSpeechRetry: false
                )
        )
        precondition(
            !OnDeviceTranscriptDeliveryPolicy
                .shouldRecoverLocallyAfterPermissionChange(
                    fallbackReasonCode: "apple-speech-permission-denied",
                    cloudFallbackWasAccepted: false,
                    cloudFallbackStatus: nil,
                    speechRecognitionIsAuthorized: true,
                    localSourceIsAvailable: false,
                    sourceNeedsClearSpeechRetry: false
                )
        )
        precondition(
            !OnDeviceTranscriptDeliveryPolicy
                .shouldRecoverLocallyAfterPermissionChange(
                    fallbackReasonCode: "apple-speech-permission-denied",
                    cloudFallbackWasAccepted: false,
                    cloudFallbackStatus: nil,
                    speechRecognitionIsAuthorized: true,
                    localSourceIsAvailable: true,
                    sourceNeedsClearSpeechRetry: true
                ),
            "a source already classified as needing clear speech must not loop after permission recovery"
        )
        precondition(
            OnDeviceTranscriptDeliveryPolicy.shouldAttemptAutomaticRecognition(
                transcriptionWasRequested: true,
                sourceIsPlaybackEligible: true,
                localSourceIsAvailable: true,
                sourceNeedsClearSpeechRetry: false,
                cloudFallbackWasAccepted: false
            )
        )
        for blockedAttempt in [
            (false, true, true, false, false),
            (true, false, true, false, false),
            (true, true, false, false, false),
            (true, true, true, true, false),
            (true, true, true, false, true),
        ] {
            precondition(
                !OnDeviceTranscriptDeliveryPolicy.shouldAttemptAutomaticRecognition(
                    transcriptionWasRequested: blockedAttempt.0,
                    sourceIsPlaybackEligible: blockedAttempt.1,
                    localSourceIsAvailable: blockedAttempt.2,
                    sourceNeedsClearSpeechRetry: blockedAttempt.3,
                    cloudFallbackWasAccepted: blockedAttempt.4
                )
            )
        }
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
                extractionEndSeconds: 52
            ),
            OnDeviceTranscriptRecognitionWindow(
                sourceStartSeconds: 50,
                sourceEndSeconds: 100,
                extractionStartSeconds: 48,
                extractionEndSeconds: 102
            ),
            OnDeviceTranscriptRecognitionWindow(
                sourceStartSeconds: 100,
                sourceEndSeconds: 130,
                extractionStartSeconds: 98,
                extractionEndSeconds: 130
            ),
        ])
        precondition(longWindows[1].owns(relativeStartSeconds: 1.5, relativeEndSeconds: 2.5))
        precondition(!longWindows[1].owns(relativeStartSeconds: 0, relativeEndSeconds: 0.5))
        // The unique owner must receive the entire crossing word, not just
        // its midpoint. Exercise both sides and exact midpoint ties; identical
        // recognition in the overlapping chunks must only be accepted once.
        for seam in [50.0, 100.0] {
            for (startOffset, endOffset) in [(-0.6, 0.4), (-0.5, 0.5), (-0.4, 0.6), (-2.0, 1.5), (-1.5, 2.0)] {
                let start = seam + startOffset
                let end = seam + endOffset
                let owners = longWindows.filter {
                    $0.owns(relativeStartSeconds: start - $0.extractionStartSeconds,
                            relativeEndSeconds: end - $0.extractionStartSeconds)
                }
                precondition(owners.count == 1)
                precondition(owners[0].extractionStartSeconds <= start)
                precondition(owners[0].extractionEndSeconds >= end)
            }
        }
        for duration in [0.01, 55.0, 55.01, 100.0, 130.0, 3_600.25] {
            let windows = OnDeviceTranscriptDeliveryPolicy.compatibleRecognitionWindows(sourceDurationSeconds: duration)
            precondition(windows.first?.extractionStartSeconds == 0)
            precondition(windows.last?.extractionEndSeconds == duration)
            for (index, window) in windows.enumerated() {
                precondition(window.extractionDurationSeconds > 0 && window.extractionDurationSeconds <= 55)
                precondition(window.extractionStartSeconds <= window.sourceStartSeconds)
                precondition(window.extractionEndSeconds >= window.sourceEndSeconds)
                if index > 0 { precondition(windows[index - 1].sourceEndSeconds == window.sourceStartSeconds) }
            }
        }
        precondition(
            OnDeviceTranscriptDeliveryPolicy
                .compatibleRecognitionWindows(sourceDurationSeconds: .infinity)
                .isEmpty
        )
        print("PASS On-device transcript delivery retry policy")
    }
}
