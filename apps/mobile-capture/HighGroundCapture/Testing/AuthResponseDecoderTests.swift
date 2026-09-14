import Foundation

private struct Fixture: Decodable, Equatable {
    let ok: Bool
    let value: String
}

@main
enum AuthResponseDecoderTests {
    static func main() throws {
        let good = try decode(
            status: 200,
            body: #"{"ok":true,"value":"ready"}"#,
            fallback: "Unreadable response."
        )
        expect(good == Fixture(ok: true, value: "ready"), "valid JSON decodes")

        expectError(
            status: 200,
            body: "<html>maintenance</html>",
            fallback: "Quipsly could not verify your saved sign-in.",
            expectedMessage: "Quipsly could not verify your saved sign-in."
        )
        expectError(
            status: 503,
            body: "gateway unavailable",
            fallback: "Unreadable response.",
            expectedMessage: "Quipsly is temporarily unavailable. Your work is safe on this device; try again in a moment."
        )
        expectError(
            status: 429,
            body: "too many requests",
            fallback: "Unreadable response.",
            expectedMessage: "Quipsly is receiving too many requests right now. Your work is safe; try again in a moment."
        )
        expectError(
            status: 400,
            body: #"{"error":{"message":"INVALID_REFRESH_TOKEN"}}"#,
            fallback: "Unreadable response.",
            expectedMessage: "INVALID_REFRESH_TOKEN"
        )
        expectError(
            status: 400,
            body: #"{"error":"Session expired"}"#,
            fallback: "Unreadable response.",
            expectedMessage: "Session expired"
        )

        requestFailuresKeepTheirScope()
        print("PASS 6 authentication response decoding tests and request connectivity classification")
    }

    private static func requestFailuresKeepTheirScope() {
        let disconnected: [URLError.Code] = [
            .notConnectedToInternet, .internationalRoamingOff, .dataNotAllowed,
        ]
        for code in disconnected {
            expect(AuthRequestConnectivity.requiresOfflineAccess(for: URLError(code)),
                   "explicit unavailable connectivity enters offline access: \(code)")
        }
        let scoped: [URLError.Code] = [
            .timedOut, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost,
            .dnsLookupFailed, .secureConnectionFailed, .serverCertificateHasBadDate,
            .serverCertificateUntrusted, .serverCertificateHasUnknownRoot,
            .serverCertificateNotYetValid, .clientCertificateRejected,
            .clientCertificateRequired, .cannotLoadFromNetwork, .resourceUnavailable,
            .badServerResponse, .cancelled, .cannotWriteToFile,
        ]
        for code in scoped {
            expect(!AuthRequestConnectivity.requiresOfflineAccess(for: URLError(code)),
                   "individual request failure preserves the authenticated workspace: \(code)")
        }
        expect(!AuthRequestConnectivity.requiresOfflineAccess(for: CancellationError()),
               "task cancellation is not lost connectivity")
        expect(!AuthRequestConnectivity.requiresOfflineAccess(for: NSError(
            domain: "QuipslySession", code: URLError.notConnectedToInternet.rawValue
        )), "an unrelated error domain cannot imitate a connectivity failure")
    }

    private static func decode(
        status: Int,
        body: String,
        fallback: String
    ) throws -> Fixture {
        let response = HTTPURLResponse(
            url: URL(string: "https://nest.quipsly.com/test")!,
            statusCode: status,
            httpVersion: "HTTP/2",
            headerFields: ["Content-Type": "application/json"]
        )!
        return try AuthResponseDecoder.decode(
            Fixture.self,
            from: Data(body.utf8),
            response: response,
            errorDomain: "AuthResponseDecoderTests",
            malformedResponseMessage: fallback
        ).payload
    }

    private static func expectError(
        status: Int,
        body: String,
        fallback: String,
        expectedMessage: String
    ) {
        do {
            _ = try decode(status: status, body: body, fallback: fallback)
            fail("Expected decoding failure for HTTP \(status)")
        } catch {
            let nsError = error as NSError
            expect(nsError.domain == "AuthResponseDecoderTests", "error domain survives")
            expect(nsError.code == status, "HTTP status survives")
            expect(
                nsError.localizedDescription == expectedMessage,
                "stable recovery message for HTTP \(status): \(nsError.localizedDescription)"
            )
            expect(
                !nsError.localizedDescription.lowercased().contains("correct format"),
                "Foundation decoder text never reaches the person"
            )
        }
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else { fail(message) }
    }

    private static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
        Foundation.exit(1)
    }
}
