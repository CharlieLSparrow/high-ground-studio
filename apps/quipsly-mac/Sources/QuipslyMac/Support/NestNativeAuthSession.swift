import AppKit
import AuthenticationServices
import Foundation

@MainActor
final class NestNativeAuthSession: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var isSigningIn = false
    @Published var lastError: String?

    private var session: ASWebAuthenticationSession?
    private let callbackScheme = "quipslymac"

    func signIn(nestBaseURL: String) async -> NestNativeAuthResult? {
        let url = NestSessionActions.nativeHandoffURL(nestBaseURL: nestBaseURL, callbackScheme: callbackScheme)
        isSigningIn = true
        lastError = nil

        return await withCheckedContinuation { continuation in
            let authSession = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
                Task { @MainActor in
                    guard let self else {
                        continuation.resume(returning: nil)
                        return
                    }

                    self.isSigningIn = false
                    self.session = nil

                    if let error {
                        self.lastError = error.localizedDescription
                        continuation.resume(returning: nil)
                        return
                    }

                    guard let callbackURL, let result = NestMacSessionCallback.parse(callbackURL) else {
                        self.lastError = "Nest did not return a usable Mac session callback."
                        continuation.resume(returning: nil)
                        return
                    }

                    continuation.resume(returning: result)
                }
            }

            authSession.presentationContextProvider = self
            authSession.prefersEphemeralWebBrowserSession = false
            self.session = authSession

            if !authSession.start() {
                self.isSigningIn = false
                self.session = nil
                self.lastError = "macOS could not start the Nest browser sign-in session."
                continuation.resume(returning: nil)
            }
        }
    }

    func cancel() {
        session?.cancel()
        session = nil
        isSigningIn = false
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApplication.shared.keyWindow
            ?? NSApplication.shared.windows.first
            ?? ASPresentationAnchor()
    }
}
