import Foundation
import Combine
import AuthenticationServices
import CryptoKit

@MainActor
final class AuthManager: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = AuthManager()

    @Published var isAuthenticated: Bool = false
    @Published var userName: String?
    @Published var isAuthenticating: Bool = false
    @Published var errorMessage: String?
    
    private let authUrlBase = Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com"
    private var authSession: ASWebAuthenticationSession?

    private let keychainService = "com.highgroundodyssey.HighGroundCapture"
    
    override private init() {
        super.init()
        checkExistingSession()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Find the active window scene
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = scenes.first as? UIWindowScene
        return windowScene?.windows.first ?? ASPresentationAnchor()
    }

    func checkExistingSession() {
        if let token = getKeychainItem(account: "refreshToken") {
            isAuthenticated = true
        } else {
            isAuthenticated = false
        }
    }

    func signIn() {
        guard !isAuthenticating else { return }
        isAuthenticating = true
        errorMessage = nil

        let state = UUID().uuidString
        let callbackScheme = "quipslymac"
        
        var components = URLComponents(string: authUrlBase)!
        components.path = "/api/mac/session-handoff"
        components.queryItems = [
            URLQueryItem(name: "native", value: "1"),
            URLQueryItem(name: "callbackScheme", value: callbackScheme),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "deviceLabel", value: UIDevice.current.name)
        ]
        
        guard let authUrl = components.url else {
            self.errorMessage = "Failed to construct auth URL"
            self.isAuthenticating = false
            return
        }

        authSession = ASWebAuthenticationSession(
            url: authUrl,
            callbackURLScheme: callbackScheme
        ) { [weak self] callbackURL, error in
            guard let self = self else { return }
            
            if let error = error {
                if let asError = error as? ASWebAuthenticationSessionError, asError.code == .canceledLogin {
                    self.isAuthenticating = false
                    return
                }
                self.errorMessage = error.localizedDescription
                self.isAuthenticating = false
                return
            }

            guard let callbackURL = callbackURL,
                  let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
                  // Notice how the nextjs backend puts the params in the hash fragment: quipslymac://auth/session#code=XYZ&state=XYZ
                  let fragment = components.fragment else {
                self.errorMessage = "Invalid callback URL"
                self.isAuthenticating = false
                return
            }

            // Parse URL-encoded fragment
            var parsedFragment = URLComponents()
            parsedFragment.query = fragment
            guard let items = parsedFragment.queryItems,
                  let code = items.first(where: { $0.name == "code" })?.value,
                  let returnedState = items.first(where: { $0.name == "state" })?.value else {
                self.errorMessage = "Missing code or state in callback"
                self.isAuthenticating = false
                return
            }

            guard returnedState == state else {
                self.errorMessage = "State mismatch"
                self.isAuthenticating = false
                return
            }
            
            Task {
                await self.exchangeCode(code: code)
            }
        }

        authSession?.presentationContextProvider = self
        authSession?.prefersEphemeralWebBrowserSession = false // Share Safari cookies to auto-login if already logged in Safari
        authSession?.start()
    }

    private func exchangeCode(code: String) async {
        do {
            var request = URLRequest(url: URL(string: "\(authUrlBase)/api/mac/session-exchange")!)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "code": code,
                "deviceLabel": UIDevice.current.name
            ])

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw URLError(.badServerResponse)
            }

            if httpResponse.statusCode >= 400 {
                // Try to parse error
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let errorStr = json["error"] as? String {
                    throw NSError(domain: "Auth", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorStr])
                }
                throw URLError(.badServerResponse)
            }

            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let ok = json["ok"] as? Bool, ok,
                  let accessToken = json["accessToken"] as? String,
                  let refreshToken = json["refreshToken"] as? String else {
                throw NSError(domain: "Auth", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid response format"])
            }

            saveKeychainItem(account: "accessToken", value: accessToken)
            saveKeychainItem(account: "refreshToken", value: refreshToken)
            
            if let user = json["user"] as? [String: Any], let name = user["name"] as? String {
                self.userName = name
            }

            self.isAuthenticated = true
            self.isAuthenticating = false
        } catch {
            self.errorMessage = error.localizedDescription
            self.isAuthenticating = false
        }
    }

    func signOut() {
        deleteKeychainItem(account: "accessToken")
        deleteKeychainItem(account: "refreshToken")
        isAuthenticated = false
        userName = nil
    }

    nonisolated func getAccessToken() -> String? {
        return getKeychainItem(account: "accessToken")
    }

    // MARK: - Keychain Helpers
    
    private func saveKeychainItem(account: String, value: String) {
        let data = value.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecValueData as String: data
        ]
        
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }
    
    nonisolated private func getKeychainItem(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: kCFBooleanTrue!,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        
        if status == errSecSuccess, let data = dataTypeRef as? Data {
            return String(data: data, encoding: .utf8)
        }
        return nil
    }
    
    private func deleteKeychainItem(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
