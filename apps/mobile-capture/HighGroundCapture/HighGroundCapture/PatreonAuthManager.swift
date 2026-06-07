import Foundation
import AuthenticationServices
import Combine

class PatreonAuthManager: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var isAuthenticated = false
    @Published var accessToken: String?
    @Published var authError: String?

    override init() {
        super.init()
        checkExistingSession()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return ASPresentationAnchor()
    }

    func checkExistingSession() {
        if let token = UserDefaults.standard.string(forKey: "PatreonAccessToken") {
            self.accessToken = token
            self.isAuthenticated = true
        }
    }

    func authenticate() {
        let authURL = URL(string: "https://www.patreon.com/oauth2/authorize?response_type=code&client_id=QUIPSLY_CLIENT_ID&redirect_uri=quipsly://oauth")!
        let callbackScheme = "quipsly"

        let session = ASWebAuthenticationSession(url: authURL, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
            guard let self = self else { return }

            DispatchQueue.main.async {
                if let error = error {
                    self.authError = "Authentication failed: \(error.localizedDescription)"
                    return
                }

                guard let url = callbackURL,
                      let components = URLComponents(url: url, resolvingAgainstBaseURL: true),
                      let code = components.queryItems?.first(where: { $0.name == "code" })?.value else {
                    self.authError = "Invalid callback URL"
                    return
                }

                // Simulate exchanging code for token with Quipsly Cloud Backend
                self.exchangeCodeForToken(code)
            }
        }

        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        session.start()
    }

    private func exchangeCodeForToken(_ code: String) {
        // In a real app, this would hit /api/auth/patreon on our backend
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            let mockToken = "mock_patreon_access_token_\(code)"
            UserDefaults.standard.set(mockToken, forKey: "PatreonAccessToken")
            self.accessToken = mockToken
            self.isAuthenticated = true
            self.authError = nil
        }
    }

    func logout() {
        UserDefaults.standard.removeObject(forKey: "PatreonAccessToken")
        self.accessToken = nil
        self.isAuthenticated = false
    }
}
