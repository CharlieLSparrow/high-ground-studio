import Foundation
import Testing
@testable import QuipslyVideoCore

struct MacFirebaseBrowserHandoffTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func acceptsOnlyTheExactFragmentCallback() throws {
        let state = String(repeating: "s", count: 43)
        let code = "qmac_" + String(repeating: "c", count: 43)
        let expiresAt = ISO8601DateFormatter().string(
            from: now.addingTimeInterval(300)
        )
        let url = try #require(URL(
            string:
                "quipslymac://auth/session#code=\(code)&state=\(state)&expiresAt=\(expiresAt)"
        ))

        let handoff = try MacFirebaseBrowserHandoffParser.parse(
            url,
            now: now
        )

        #expect(handoff.code == code)
        #expect(handoff.state == state)
        #expect(handoff.expiresAt > now)
    }

    @Test func rejectsQueryTokensAndWrongRoutes() throws {
        let state = String(repeating: "s", count: 43)
        let code = "qmac_" + String(repeating: "c", count: 43)
        let url = try #require(URL(
            string:
                "quipslymac://auth/session?code=\(code)&state=\(state)&expiresAt=2030-01-01T00:00:00Z"
        ))

        #expect(throws: MacFirebaseBrowserHandoffError.wrongCallback) {
            try MacFirebaseBrowserHandoffParser.parse(url, now: now)
        }
    }

    @Test func rejectsDuplicateOrLowEntropyFields() throws {
        let state = String(repeating: "s", count: 43)
        let code = "qmac_" + String(repeating: "c", count: 43)
        let duplicate = try #require(URL(
            string:
                "quipslymac://auth/session#code=\(code)&code=\(code)&state=\(state)&expiresAt=2030-01-01T00:00:00Z"
        ))
        let weak = try #require(URL(
            string:
                "quipslymac://auth/session#code=qmac_tiny&state=tiny&expiresAt=2030-01-01T00:00:00Z"
        ))
        let unexpected = try #require(URL(
            string:
                "quipslymac://auth/session#code=\(code)&state=\(state)&expiresAt=2030-01-01T00:00:00Z&token=unexpected"
        ))

        #expect(throws: MacFirebaseBrowserHandoffError.malformedFragment) {
            try MacFirebaseBrowserHandoffParser.parse(duplicate, now: now)
        }
        #expect(throws: MacFirebaseBrowserHandoffError.invalidCode) {
            try MacFirebaseBrowserHandoffParser.parse(weak, now: now)
        }
        #expect(throws: MacFirebaseBrowserHandoffError.malformedFragment) {
            try MacFirebaseBrowserHandoffParser.parse(unexpected, now: now)
        }
    }

    @Test func rejectsExpiredCallbacks() throws {
        let state = String(repeating: "s", count: 43)
        let code = "qmac_" + String(repeating: "c", count: 43)
        let expiresAt = ISO8601DateFormatter().string(
            from: now.addingTimeInterval(-1)
        )
        let url = try #require(URL(
            string:
                "quipslymac://auth/session#code=\(code)&state=\(state)&expiresAt=\(expiresAt)"
        ))

        #expect(throws: MacFirebaseBrowserHandoffError.expired) {
            try MacFirebaseBrowserHandoffParser.parse(url, now: now)
        }
    }
}
