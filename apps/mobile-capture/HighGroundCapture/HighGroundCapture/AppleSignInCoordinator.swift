import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

struct AppleSignInCredential {
    let identityToken: String
    let rawNonce: String
    let displayName: String?
}

@MainActor
final class AppleSignInCoordinator: NSObject {
    enum FlowError: LocalizedError {
        case alreadyRunning
        case cancelled
        case credentialUnavailable
        case presentationUnavailable
        case randomGenerationFailed(OSStatus)

        var errorDescription: String? {
            switch self {
            case .alreadyRunning:
                return "Apple sign-in is already open."
            case .cancelled:
                return nil
            case .credentialUnavailable:
                return "Apple did not return the secure identity credential Quipsly needs. Try Continue with Apple again."
            case .presentationUnavailable:
                return "Quipsly could not open Apple’s secure sign-in sheet. Return to Capture and try again."
            case .randomGenerationFailed:
                return "Quipsly could not create the one-time security value required for Apple sign-in. Try again."
            }
        }
    }

    private var continuation: CheckedContinuation<AppleSignInCredential, Error>?
    private var rawNonce: String?
    private var authorizationController: ASAuthorizationController?
    private var activePresentationAnchor: ASPresentationAnchor?

    func authorize() async throws -> AppleSignInCredential {
        guard continuation == nil else { throw FlowError.alreadyRunning }
        guard let presentationAnchor = availablePresentationAnchor() else {
            throw FlowError.presentationUnavailable
        }

        let nonce = try Self.randomNonceString()
        rawNonce = nonce
        activePresentationAnchor = presentationAnchor
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            authorizationController = controller
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    private func finish(_ result: Result<AppleSignInCredential, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        rawNonce = nil
        authorizationController = nil
        activePresentationAnchor = nil
        switch result {
        case .success(let credential):
            continuation.resume(returning: credential)
        case .failure(let error):
            continuation.resume(throwing: error)
        }
    }

    private func availablePresentationAnchor() -> ASPresentationAnchor? {
        let scenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
        return scenes.flatMap(\.windows).first(where: \.isKeyWindow)
            ?? scenes.flatMap(\.windows).first
    }

    private static func randomNonceString(length: Int = 32) throws -> String {
        precondition(length > 0)
        let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        result.reserveCapacity(length)

        while result.count < length {
            var randomBytes = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
            guard status == errSecSuccess else {
                throw FlowError.randomGenerationFailed(status)
            }
            for byte in randomBytes where byte < alphabet.count {
                result.append(alphabet[Int(byte)])
                if result.count == length { break }
            }
        }
        return result
    }

    private static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

extension AppleSignInCoordinator: ASAuthorizationControllerDelegate {
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8),
              !identityToken.isEmpty,
              let rawNonce else {
            finish(.failure(FlowError.credentialUnavailable))
            return
        }

        let name = PersonNameComponentsFormatter()
            .string(from: credential.fullName ?? PersonNameComponents())
            .trimmingCharacters(in: .whitespacesAndNewlines)
        finish(.success(AppleSignInCredential(
            identityToken: identityToken,
            rawNonce: rawNonce,
            displayName: name.isEmpty ? nil : name
        )))
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        let authorizationError = error as? ASAuthorizationError
        if authorizationError?.code == .canceled {
            finish(.failure(FlowError.cancelled))
        } else {
            finish(.failure(error))
        }
    }
}

extension AppleSignInCoordinator: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        activePresentationAnchor ?? availablePresentationAnchor() ?? ASPresentationAnchor()
    }
}
