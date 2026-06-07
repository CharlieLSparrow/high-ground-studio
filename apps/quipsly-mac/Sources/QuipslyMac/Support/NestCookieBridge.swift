import Foundation
import WebKit

enum NestCookieBridge {
    static func addCookies(to request: URLRequest, completion: @escaping (URLRequest) -> Void) {
        if let token = macSessionToken() {
            var tokenRequest = request
            tokenRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            completion(tokenRequest)
            return
        }

        Task { @MainActor in
            addWebCookiesOnMain(to: request, completion: completion)
        }
    }

    @MainActor
    private static func addWebCookiesOnMain(to request: URLRequest, completion: @escaping (URLRequest) -> Void) {
        guard let url = request.url else {
            completion(request)
            return
        }

        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
            var nextRequest = request
            let matchingCookies = cookies.filter { cookie in
                shouldSend(cookie: cookie, to: url)
            }

            if !matchingCookies.isEmpty {
                let fields = HTTPCookie.requestHeaderFields(with: matchingCookies)
                if let cookieHeader = fields["Cookie"] {
                    nextRequest.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
                }
            }

            completion(nextRequest)
        }
    }

    static func addingCookies(to request: URLRequest) async -> URLRequest {
        await withCheckedContinuation { continuation in
            addCookies(to: request) { requestWithCookies in
                continuation.resume(returning: requestWithCookies)
            }
        }
    }

    private static func shouldSend(cookie: HTTPCookie, to url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        let cookieDomain = cookie.domain
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))
            .lowercased()

        guard host == cookieDomain || host.hasSuffix(".\(cookieDomain)") else {
            return false
        }

        if cookie.isSecure && url.scheme?.lowercased() != "https" {
            return false
        }

        let requestPath = url.path.isEmpty ? "/" : url.path
        return requestPath.hasPrefix(cookie.path)
    }

    private static func macSessionToken() -> String? {
        let token = NestSessionTokenStore.load()
        return token.isEmpty ? nil : token
    }
}
