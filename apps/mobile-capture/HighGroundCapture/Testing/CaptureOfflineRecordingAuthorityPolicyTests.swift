import Foundation

@main
enum CaptureOfflineRecordingAuthorityPolicyTests {
    static func main() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        expectAllow(
            input(
                now: now,
                refreshedAt: now.addingTimeInterval(-30),
                stale: false,
                ready: true,
                hasConsentID: true
            ),
            "recent authoritative consent survives a brief transport outage"
        )
        expectDeny(
            input(
                now: now,
                refreshedAt: now.addingTimeInterval(
                    -(CaptureOfflineRecordingAuthorityPolicy.maximumAuthoritativeAge + 1)
                ),
                stale: false,
                ready: true,
                hasConsentID: true
            ),
            "expired authority cannot open a source"
        )
        expectDeny(
            input(
                now: now,
                refreshedAt: now.addingTimeInterval(-30),
                stale: true,
                ready: true,
                hasConsentID: true
            ),
            "cold protected cache cannot authorize recording"
        )
        expectDeny(
            input(
                now: now,
                refreshedAt: now.addingTimeInterval(-30),
                stale: false,
                ready: false,
                hasConsentID: true
            ),
            "incomplete readiness cannot authorize recording"
        )
        expectDeny(
            input(
                now: now,
                refreshedAt: now.addingTimeInterval(-30),
                stale: false,
                ready: true,
                hasConsentID: false
            ),
            "missing consent identity cannot authorize recording"
        )
        expectDeny(
            input(
                now: now,
                refreshedAt: nil,
                stale: false,
                ready: true,
                hasConsentID: true
            ),
            "a session never verified in this app process cannot authorize recording"
        )
        expectDeny(
            input(
                now: now,
                refreshedAt: now.addingTimeInterval(1),
                stale: false,
                ready: true,
                hasConsentID: true
            ),
            "future timestamps fail closed"
        )

        expectRetry(425, retryOnConflict: false, "room revalidation retries")
        expectRetry(408, retryOnConflict: false, "request timeout retries")
        expectRetry(429, retryOnConflict: false, "rate limit retries")
        expectRetry(503, retryOnConflict: false, "server outage retries")
        expectRetry(409, retryOnConflict: true, "explicit conflict recovery retries")
        guard !CaptureCanonicalControlRetryPolicy.isRetryable(
            statusCode: 409,
            serverMarkedRetryable: false,
            retryOnConflict: false
        ) else {
            fail("An ordinary binding conflict must remain held for correction")
        }

        print("PASS 7 offline authority and 6 canonical retry policy tests")
    }

    private static func input(
        now: Date,
        refreshedAt: Date?,
        stale: Bool,
        ready: Bool,
        hasConsentID: Bool
    ) -> CaptureOfflineRecordingAuthorityInput {
        CaptureOfflineRecordingAuthorityInput(
            lastAuthoritativeRefreshAt: refreshedAt,
            evaluatedAt: now,
            sessionsAreFromProtectedCache: stale,
            recordingIsReady: ready,
            hasRecordingConsentID: hasConsentID
        )
    }

    private static func expectAllow(
        _ input: CaptureOfflineRecordingAuthorityInput,
        _ label: String
    ) {
        guard CaptureOfflineRecordingAuthorityPolicy.decide(input)
            == .allow(.recentDeviceConsent) else {
            fail("Expected allow: \(label)")
        }
    }

    private static func expectDeny(
        _ input: CaptureOfflineRecordingAuthorityInput,
        _ label: String
    ) {
        guard CaptureOfflineRecordingAuthorityPolicy.decide(input) == .deny else {
            fail("Expected deny: \(label)")
        }
    }

    private static func expectRetry(
        _ statusCode: Int,
        retryOnConflict: Bool,
        _ label: String
    ) {
        guard CaptureCanonicalControlRetryPolicy.isRetryable(
            statusCode: statusCode,
            serverMarkedRetryable: false,
            retryOnConflict: retryOnConflict
        ) else {
            fail("Expected retry: \(label)")
        }
    }

    private static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
        Foundation.exit(1)
    }
}
