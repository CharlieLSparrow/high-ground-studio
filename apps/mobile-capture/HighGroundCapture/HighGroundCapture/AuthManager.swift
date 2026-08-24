import Foundation
import Combine
import Security
import UIKit
import GoogleSignIn

extension Notification.Name {
    static let quipslyCaptureAccountIdentityDidChange = Notification.Name("QuipslyCaptureAccountIdentityDidChange")
}

enum AuthAccessMode: String {
    case signedOut
    case checking
    case checkingCachedIdentity
    case online
    case offlineCachedIdentity
}

@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    @Published var isAuthenticated: Bool = false
    @Published var userName: String?
    @Published var userEmail: String?
    @Published private(set) var accountOwnerID: String?
    @Published var isAuthenticating: Bool = false
    @Published var errorMessage: String?
    @Published private(set) var statusMessage: String?
    @Published private(set) var recentlyCreatedEmail: String?
    @Published private(set) var accessMode: AuthAccessMode = .signedOut
    @Published private(set) var offlineAccessMessage: String?

    var hasProtectedOfflineAccess: Bool {
        accessMode == .checkingCachedIdentity || accessMode == .offlineCachedIdentity
    }

    var networkActionsAllowed: Bool {
        accessMode == .online && isAuthenticated
    }

    private let authUrlBase = normalizedNestBaseURL(
        ProcessInfo.processInfo.environment["QUIPSLY_API_BASE_URL"]
            ?? (Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String)
            ?? "https://nest.quipsly.com"
    )
    nonisolated private static let keychainService = "com.highgroundodyssey.HighGroundCapture"
    nonisolated private static let tokenRefreshSkewSeconds: Int64 = 5 * 60
    nonisolated private static let cachedIdentityLifetimeSeconds: TimeInterval = 30 * 24 * 60 * 60
    private var refreshTask: Task<Bool, Never>?
    private var refreshTaskID: UUID?
    private var interactiveAuthAttemptID: UUID?
    private var appleSignInCoordinator: AppleSignInCoordinator?
    private var accountIdentityGeneration: UInt64 = 0
    private var lastPublishedOwnerAccountID: String?

    private struct AuthenticatedOwnerBinding {
        let ownerAccountID: String
        let generation: UInt64
    }

    private struct StoredSessionBinding {
        let refreshToken: String
        let ownerAccountID: String?
        let generation: UInt64
    }

    private struct GoogleClientConfiguration {
        let iosClientID: String
        let serverClientID: String
    }

    /// An immutable account-generation token for multi-await product intents
    /// such as permission-gated capture start and provider-room join.
    struct StableOwnerSnapshot: Equatable {
        let ownerAccountID: String
        fileprivate let generation: UInt64
    }

    private enum AuthenticatedRequestError: LocalizedError {
        case signInRequired
        case refreshFailed
        case sessionRejected
        case offlineAccess
        case accountChanged

        var errorDescription: String? {
            switch self {
            case .signInRequired:
                return "Sign in to continue."
            case .refreshFailed:
                return "Your Quipsly session could not be refreshed. Sign in again to continue."
            case .sessionRejected:
                return "Nest rejected the refreshed Quipsly session. Sign in again to continue."
            case .offlineAccess:
                return "Nest is unavailable. Quipsly opened the protected local Library; network actions remain disabled until your session is verified again."
            case .accountChanged:
                return "The signed-in Quipsly account changed before this protected request finished. The request was not replayed."
            }
        }
    }

    private struct FirebaseClientConfigResponse: Decodable {
        let ok: Bool
        let error: String?
        let firebase: FirebaseClientConfig?
    }

    private struct FirebaseClientConfig: Decodable {
        let apiKey: String
        let projectId: String
        let authEmulatorUrl: String?

        var validatedAuthEmulatorURL: URL? {
            guard let rawValue = authEmulatorUrl?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !rawValue.isEmpty,
                  let url = URL(string: rawValue),
                  url.scheme == "http",
                  url.host == "localhost" || url.host == "127.0.0.1",
                  url.user == nil,
                  url.password == nil,
                  url.path.isEmpty || url.path == "/",
                  url.query == nil,
                  url.fragment == nil else {
                return nil
            }
            return url
        }

        var identityToolkitBaseURL: String {
            if let emulatorURL = validatedAuthEmulatorURL {
                return "\(emulatorURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/identitytoolkit.googleapis.com"
            }
            return "https://identitytoolkit.googleapis.com"
        }

        var secureTokenBaseURL: String {
            if let emulatorURL = validatedAuthEmulatorURL {
                return "\(emulatorURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/securetoken.googleapis.com"
            }
            return "https://securetoken.googleapis.com"
        }
    }

    private struct FirebasePasswordSignInResponse: Decodable {
        let idToken: String?
        let email: String?
        let refreshToken: String?
        let expiresIn: String?
        let localId: String?
        let displayName: String?
        let error: FirebaseRestErrorEnvelope?
    }

    private struct FirebaseFederatedSignInResponse: Decodable {
        let idToken: String?
        let email: String?
        let emailVerified: Bool?
        let refreshToken: String?
        let expiresIn: String?
        let localId: String?
        let displayName: String?
        let needConfirmation: Bool?
        let pendingToken: String?
        let error: FirebaseRestErrorEnvelope?
    }

    private struct FirebaseAccountLookupResponse: Decodable {
        let users: [FirebaseAccountInfo]?
        let error: FirebaseRestErrorEnvelope?
    }

    private struct FirebaseAccountInfo: Decodable {
        let localId: String?
        let email: String?
        let emailVerified: Bool?
        let displayName: String?
        let providerUserInfo: [FirebaseProviderInfo]?
    }

    private struct FirebaseProviderInfo: Decodable {
        let providerId: String?
    }

    private struct FirebaseOOBResponse: Decodable {
        let email: String?
        let error: FirebaseRestErrorEnvelope?
    }

    private struct FirebaseRefreshResponse: Decodable {
        let id_token: String?
        let refresh_token: String?
        let expires_in: String?
        let user_id: String?
        let error: FirebaseRestErrorEnvelope?
    }

    private struct FirebaseRestErrorEnvelope: Decodable {
        let message: String?
    }

    private struct NativeSessionCheckResponse: Decodable {
        let ok: Bool?
        let authenticated: Bool?
        let error: String?
        let user: NativeSessionUser?
    }

    private struct NativeSessionUser: Decodable {
        let id: String?
        let email: String?
        let primaryEmail: String?
        let name: String?
    }

    private struct VerifiedNativeSession {
        let ownerAccountID: String
        let email: String?
        let name: String?
    }

    private enum NativeAuthFlowError: LocalizedError {
        case emailVerificationRequired(freshLinkSent: Bool)
        case accountCreatedButVerificationSendFailed
        case googleConfigurationUnavailable
        case googleCredentialUnavailable
        case googleEmailNotVerified
        case googleAccountNeedsLinking
        case appleCredentialUnavailable
        case appleEmailNotVerified
        case appleAccountNeedsLinking

        var errorDescription: String? {
            switch self {
            case .emailVerificationRequired(let freshLinkSent):
                if freshLinkSent {
                    return "This password account is not verified. We sent a fresh link for password sign-in. If you already use Quipsly with Google, choose Continue with Google instead—no verification email is needed."
                }
                return "This password account is not verified, and Firebase could not send a fresh link. If you already use Quipsly with Google, choose Continue with Google instead."
            case .accountCreatedButVerificationSendFailed:
                return "Your Firebase account was created, but the verification email could not be sent. Switch to Sign in and try this account once; Capture will request a fresh verification link."
            case .googleConfigurationUnavailable:
                return "Google sign-in is not configured in this Capture build yet. Use a verified email/password account for now or install the next TestFlight build after Quipsly finishes Google setup."
            case .googleCredentialUnavailable:
                return "Google completed sign-in without returning the secure identity token Quipsly needs. Try Continue with Google again."
            case .googleEmailNotVerified:
                return "Google did not return a verified email for this account, so Quipsly did not create or open a workspace."
            case .googleAccountNeedsLinking:
                return "That Google email already belongs to a different Firebase sign-in method. Quipsly did not create a duplicate. Use the account's existing sign-in once, then link Google from account settings or contact support."
            case .appleCredentialUnavailable:
                return "Apple completed sign-in without returning the secure identity token Quipsly needs. Try Continue with Apple again."
            case .appleEmailNotVerified:
                return "Apple did not return a verified account email, so Quipsly did not create or open a workspace."
            case .appleAccountNeedsLinking:
                return "That Apple email already belongs to a different Firebase sign-in method. Quipsly did not create a duplicate. Use the account's existing sign-in once, then link Apple from account settings or contact support."
            }
        }
    }

    private init() {
        if let previewOwner = CaptureLaunchConfiguration.shareExtensionUITestOwner {
            accountOwnerID = previewOwner
            isAuthenticated = false
            accessMode = .offlineCachedIdentity
            offlineAccessMessage = "Simulator Share Sheet proof · network actions disabled."
            return
        }
        checkExistingSession()
    }

    /// Installs or removes only a marker-bound simulator credential partition.
    /// Release and physical-device builds contain no such path. This lets UI
    /// tests prove the system Share Sheet handoff while network actions remain
    /// disabled and no real Quipsly identity is required.
    nonisolated static func configureShareExtensionUITestOwnerIfRequested() {
        #if DEBUG && targetEnvironment(simulator)
        let prefix = "--capture-share-owner-ui-preview="
        guard let argument = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix(prefix) }) else { return }
        let rawValue = String(argument.dropFirst(prefix.count)).trimmingCharacters(in: .whitespacesAndNewlines)
        let markerAccount = "shareExtensionUITestOwnerInstalled"

        if rawValue == "none" {
            if getKeychainItem(account: markerAccount) == "1" {
                for account in ["refreshToken", "accountOwnerID", "verifiedIdentityAtEpochSeconds", markerAccount] {
                    deleteKeychainItemForUITest(account: account)
                }
            }
            ShareCaptureBridge.publishOwner(nil)
            return
        }

        guard !rawValue.isEmpty, rawValue.count <= 256 else { return }
        saveKeychainItemForUITest(account: "refreshToken", value: "simulator-share-extension-ui-test")
        saveKeychainItemForUITest(account: "accountOwnerID", value: rawValue)
        saveKeychainItemForUITest(account: "verifiedIdentityAtEpochSeconds", value: String(Int64(Date().timeIntervalSince1970)))
        saveKeychainItemForUITest(account: markerAccount, value: "1")
        ShareCaptureBridge.publishOwner(rawValue)
        #endif
    }

    /// Clears only Capture's saved authentication partition when a simulator
    /// runtime smoke changes disposable actors. The actor marker survives app
    /// replacement, just like the Keychain credentials it guards, while an
    /// in-test relaunch for the same actor retains the authenticated session.
    /// Release builds and physical devices contain no active reset path.
    nonisolated static func configureRuntimeSmokeAccountResetIfRequested() {
        #if DEBUG && targetEnvironment(simulator)
        let process = ProcessInfo.processInfo
        guard process.arguments.contains("--quipsly-capture-runtime-smoke"),
              let credentialsPath = process.environment["QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE"],
              credentialsPath == "/tmp/quipsly-capture-runtime-ui-smoke-credentials.json",
              let data = try? Data(contentsOf: URL(fileURLWithPath: credentialsPath)),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rawEmail = payload["email"] as? String,
              let rawRunID = payload["runtimeSmokeRunID"] as? String else { return }

        let actor = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let runID = rawRunID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let validRunIDCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-"))
        guard !actor.isEmpty,
              actor.count <= 320,
              (16...128).contains(runID.count),
              runID.unicodeScalars.allSatisfy(validRunIDCharacters.contains) else { return }

        let markerAccount = "runtimeSmokeAuthenticatedActor"
        let runBinding = "\(actor)|\(runID)"
        guard getKeychainItem(account: markerAccount) != runBinding else { return }

        for account in [
            "accessToken",
            "refreshToken",
            "expiresAtEpochSeconds",
            "userEmail",
            "userName",
            "accountOwnerID",
            "verifiedIdentityAtEpochSeconds",
        ] {
            deleteKeychainItemForUITest(account: account)
        }
        saveKeychainItemForUITest(account: markerAccount, value: runBinding)
        #endif
    }

    func checkExistingSession() {
        userName = getKeychainItem(account: "userName")
        userEmail = getKeychainItem(account: "userEmail")
        accountOwnerID = Self.currentStoredOwnerID()

        if getKeychainItem(account: "refreshToken") != nil {
            isAuthenticated = false
            accessMode = hasRecentlyVerifiedCachedIdentity()
                ? .checkingCachedIdentity
                : .checking
            offlineAccessMessage = hasProtectedOfflineAccess
                ? "Verifying your saved Quipsly identity. The protected local Library remains available."
                : nil
            Task { await refreshAccessTokenIfNeeded(force: false, allowOfflineRecovery: true) }
        } else {
            setSignedOutState()
        }
    }

    var googleSignInAvailable: Bool {
        Self.googleClientConfiguration != nil
    }

    func signInWithApple() {
        guard let attemptID = beginInteractiveAuthAttempt() else { return }
        let coordinator = AppleSignInCoordinator()
        appleSignInCoordinator = coordinator

        Task {
            defer {
                if appleSignInCoordinator === coordinator {
                    appleSignInCoordinator = nil
                }
            }
            do {
                let firebaseConfig = try await fetchFirebaseConfig()
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                let appleCredential = try await coordinator.authorize()
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }

                let signIn = try await signInWithFirebaseApple(
                    appleIDToken: appleCredential.identityToken,
                    rawNonce: appleCredential.rawNonce,
                    config: firebaseConfig
                )
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                guard signIn.needConfirmation != true,
                      signIn.pendingToken?.isEmpty != false else {
                    throw NativeAuthFlowError.appleAccountNeedsLinking
                }
                guard signIn.emailVerified == true else {
                    throw NativeAuthFlowError.appleEmailNotVerified
                }
                guard let idToken = signIn.idToken,
                      let refreshToken = signIn.refreshToken else {
                    throw NativeAuthFlowError.appleCredentialUnavailable
                }

                let verifiedSession = try await verifyQuipslyNativeSession(accessToken: idToken)
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                let expiresInSeconds = Int64(signIn.expiresIn ?? "3600") ?? 3600
                guard saveVerifiedNativeSession(
                    accessToken: idToken,
                    refreshToken: refreshToken,
                    expiresInSeconds: expiresInSeconds,
                    email: verifiedSession.email ?? signIn.email,
                    displayName: verifiedSession.name ?? signIn.displayName ?? appleCredential.displayName,
                    ownerAccountID: verifiedSession.ownerAccountID
                ), markIdentityVerified() else {
                    let storageMessage = credentialStorageError().localizedDescription
                    signOut()
                    errorMessage = storageMessage
                    return
                }

                setOnlineState()
                finishInteractiveAuthAttempt(attemptID)
            } catch AppleSignInCoordinator.FlowError.cancelled {
                finishInteractiveAuthAttempt(attemptID)
            } catch {
                failInteractiveAuthAttempt(attemptID, error: error)
            }
        }
    }

    func signInWithGoogle() {
        guard let googleConfiguration = Self.googleClientConfiguration else {
            errorMessage = NativeAuthFlowError.googleConfigurationUnavailable.localizedDescription
            return
        }
        guard let presentingViewController = Self.activePresentationViewController() else {
            errorMessage = "Quipsly could not open Google's secure sign-in sheet. Return to Capture and try again."
            return
        }
        guard let attemptID = beginInteractiveAuthAttempt() else { return }

        Task {
            do {
                let firebaseConfig = try await fetchFirebaseConfig()
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }

                GIDSignIn.sharedInstance.configuration = GIDConfiguration(
                    clientID: googleConfiguration.iosClientID,
                    serverClientID: googleConfiguration.serverClientID
                )
                let result = try await GIDSignIn.sharedInstance.signIn(
                    withPresenting: presentingViewController
                )
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                guard let googleIDToken = result.user.idToken?.tokenString,
                      !googleIDToken.isEmpty else {
                    throw NativeAuthFlowError.googleCredentialUnavailable
                }

                let signIn = try await signInWithFirebaseGoogle(
                    googleIDToken: googleIDToken,
                    config: firebaseConfig
                )
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                guard signIn.needConfirmation != true,
                      signIn.pendingToken?.isEmpty != false else {
                    throw NativeAuthFlowError.googleAccountNeedsLinking
                }
                guard signIn.emailVerified == true else {
                    throw NativeAuthFlowError.googleEmailNotVerified
                }
                guard let idToken = signIn.idToken,
                      let refreshToken = signIn.refreshToken else {
                    throw NativeAuthFlowError.googleCredentialUnavailable
                }

                let verifiedSession = try await verifyQuipslyNativeSession(accessToken: idToken)
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                let expiresInSeconds = Int64(signIn.expiresIn ?? "3600") ?? 3600
                guard saveVerifiedNativeSession(
                    accessToken: idToken,
                    refreshToken: refreshToken,
                    expiresInSeconds: expiresInSeconds,
                    email: verifiedSession.email ?? signIn.email,
                    displayName: verifiedSession.name ?? signIn.displayName,
                    ownerAccountID: verifiedSession.ownerAccountID
                ), markIdentityVerified() else {
                    let storageMessage = credentialStorageError().localizedDescription
                    signOut()
                    errorMessage = storageMessage
                    return
                }

                setOnlineState()
                finishInteractiveAuthAttempt(attemptID)
            } catch {
                if Self.isGoogleSignInCancellation(error) {
                    finishInteractiveAuthAttempt(attemptID)
                } else {
                    failInteractiveAuthAttempt(attemptID, error: error)
                }
            }
        }
    }

    func signIn(email rawEmail: String, password: String) {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Enter the reviewer or Quipsly account email and password."
            return
        }
        guard let attemptID = beginInteractiveAuthAttempt() else { return }

        Task {
            do {
                let config = try await fetchFirebaseConfig()
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                let signIn = try await signInWithFirebasePassword(email: email, password: password, config: config)
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                guard let idToken = signIn.idToken,
                      let refreshToken = signIn.refreshToken else {
                    throw NSError(domain: "Auth", code: 1, userInfo: [NSLocalizedDescriptionKey: "Firebase did not return a native session token."])
                }

                // Firebase password sign-in intentionally returns credentials for an
                // unverified mailbox. Resolve fresh account data before writing any
                // credential or identity into Keychain or asking Nest for a session.
                let account = try await fetchFirebaseAccount(idToken: idToken, config: config)
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                guard account.emailVerified == true else {
                    let freshLinkSent = (try? await sendEmailVerification(idToken: idToken, config: config)) != nil
                    guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                    throw NativeAuthFlowError.emailVerificationRequired(freshLinkSent: freshLinkSent)
                }

                let verifiedSession = try await verifyQuipslyNativeSession(accessToken: idToken)
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                let expiresInSeconds = Int64(signIn.expiresIn ?? "3600") ?? 3600
                guard saveVerifiedNativeSession(
                    accessToken: idToken,
                    refreshToken: refreshToken,
                    expiresInSeconds: expiresInSeconds,
                    email: verifiedSession.email ?? account.email ?? signIn.email ?? email,
                    displayName: verifiedSession.name ?? account.displayName ?? signIn.displayName,
                    ownerAccountID: verifiedSession.ownerAccountID
                ), markIdentityVerified() else {
                    let storageMessage = credentialStorageError().localizedDescription
                    signOut()
                    errorMessage = storageMessage
                    return
                }

                setOnlineState()
                finishInteractiveAuthAttempt(attemptID)
            } catch {
                failInteractiveAuthAttempt(attemptID, error: error)
            }
        }
    }

    func createAccount(email rawEmail: String, password: String) {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !email.isEmpty else {
            errorMessage = "Enter the email address you want Quipsly to use as your account identity."
            return
        }
        guard password.count >= 8 else {
            errorMessage = "Use at least 8 characters for a new Quipsly password. A short phrase is better than a tiny secret."
            return
        }
        guard let attemptID = beginInteractiveAuthAttempt() else { return }

        Task {
            do {
                let config = try await fetchFirebaseConfig()
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                let account = try await createFirebasePasswordAccount(
                    email: email,
                    password: password,
                    config: config
                )
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                guard let idToken = account.idToken else {
                    throw NSError(domain: "Auth", code: 4, userInfo: [NSLocalizedDescriptionKey: "Firebase created the account without returning a verification credential."])
                }

                do {
                    try await sendEmailVerification(idToken: idToken, config: config)
                } catch {
                    guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                    throw NativeAuthFlowError.accountCreatedButVerificationSendFailed
                }
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }

                // The sign-up response contains valid tokens. They deliberately stay
                // memory-only: an unverified account never becomes cached/offline access.
                recentlyCreatedEmail = account.email ?? email
                statusMessage = "Account created safely. Check your inbox, verify the address, then sign in. Verification proves identity; it does not grant Capture beta recording or upload access. Nest will show this account's access status."
                finishInteractiveAuthAttempt(attemptID)
            } catch {
                failInteractiveAuthAttempt(attemptID, error: error)
            }
        }
    }

    func sendPasswordReset(email rawEmail: String) {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !email.isEmpty else {
            errorMessage = "Enter your email address first, then Quipsly can ask Firebase to send a password reset email."
            return
        }
        guard let attemptID = beginInteractiveAuthAttempt() else { return }

        Task {
            do {
                let config = try await fetchFirebaseConfig()
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                do {
                    try await sendPasswordResetEmail(email: email, config: config)
                } catch {
                    // Keep recovery enumeration-safe even when a Firebase project has
                    // not enabled email-enumeration protection yet.
                    guard firebaseErrorCode(error) == "EMAIL_NOT_FOUND" else { throw error }
                }
                guard interactiveAuthAttemptIsCurrent(attemptID) else { return }
                statusMessage = "If that email has a password login, a reset email may be on the way. If the account began with Google, use Continue with Google instead—Google accounts do not need a Quipsly password."
                finishInteractiveAuthAttempt(attemptID)
            } catch {
                failInteractiveAuthAttempt(attemptID, error: error)
            }
        }
    }

    func clearAuthFeedback() {
        guard !isAuthenticating else { return }
        errorMessage = nil
        statusMessage = nil
    }

    /// Legacy button compatibility for older call sites.
    func signIn() {
        errorMessage = "Choose Continue with Google, or use the email/password fields for an account that was created with a password."
    }

    private func beginInteractiveAuthAttempt() -> UUID? {
        guard !isAuthenticating else { return nil }
        let attemptID = UUID()
        interactiveAuthAttemptID = attemptID
        isAuthenticating = true
        errorMessage = nil
        statusMessage = nil
        recentlyCreatedEmail = nil
        return attemptID
    }

    private func interactiveAuthAttemptIsCurrent(_ attemptID: UUID) -> Bool {
        interactiveAuthAttemptID == attemptID
    }

    private func finishInteractiveAuthAttempt(_ attemptID: UUID) {
        guard interactiveAuthAttemptID == attemptID else { return }
        interactiveAuthAttemptID = nil
        isAuthenticating = false
    }

    private func failInteractiveAuthAttempt(_ attemptID: UUID, error: Error) {
        guard interactiveAuthAttemptID == attemptID else { return }
        interactiveAuthAttemptID = nil
        isAuthenticating = false
        errorMessage = humanAuthError(error)
    }

    @discardableResult
    func refreshAccessTokenIfNeeded(
        force: Bool = false,
        allowOfflineRecovery: Bool = false
    ) async -> Bool {
        guard let refreshToken = getKeychainItem(account: "refreshToken") else {
            setSignedOutState()
            return false
        }
        let storedSessionBinding = StoredSessionBinding(
            refreshToken: refreshToken,
            ownerAccountID: Self.currentStoredOwnerID(),
            generation: accountIdentityGeneration
        )

        if accessMode == .offlineCachedIdentity && !allowOfflineRecovery {
            return false
        }

        // Firebase refresh tokens may rotate. Coalesce before inspecting a token
        // that an in-flight refresh may already have replaced but not yet bound
        // back to the verified Nest owner.
        if let refreshTask {
            return await refreshTask.value
        }

        if !force, let token = getAccessToken(), !isTokenExpiringSoon(), !token.isEmpty {
            if accessMode == .online {
                return true
            }
            do {
                let config = try await fetchFirebaseConfig()
                try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: refreshToken)
                let account = try await fetchFirebaseAccount(idToken: token, config: config)
                try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: refreshToken)
                guard account.emailVerified == true else {
                    let freshLinkSent = (try? await sendEmailVerification(idToken: token, config: config)) != nil
                    try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: refreshToken)
                    throw NativeAuthFlowError.emailVerificationRequired(freshLinkSent: freshLinkSent)
                }
                let verifiedSession = try await verifyQuipslyNativeSession(accessToken: token)
                try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: refreshToken)
                guard saveVerifiedNativeIdentity(
                    verifiedSession,
                    fallbackEmail: account.email ?? userEmail,
                    fallbackDisplayName: account.displayName ?? userName
                ), markIdentityVerified() else {
                    let storageMessage = credentialStorageError().localizedDescription
                    signOut()
                    errorMessage = storageMessage
                    return false
                }
                setOnlineState()
                return true
            } catch {
                if error is CancellationError || !storedSessionBindingMatches(storedSessionBinding, expectedRefreshToken: refreshToken) {
                    return false
                }
                handleSessionRefreshFailure(error)
                return false
            }
        }

        let taskID = UUID()
        let task = Task { @MainActor [weak self] in
            guard let self else { return false }
            return await self.performAccessTokenRefresh(
                refreshToken: refreshToken,
                storedSessionBinding: storedSessionBinding
            )
        }
        refreshTask = task
        refreshTaskID = taskID

        let succeeded = await task.value
        if refreshTaskID == taskID {
            refreshTask = nil
            refreshTaskID = nil
        }
        return succeeded
    }

    /// Sends an authenticated request with a proactively refreshed Firebase token.
    /// Every call is bound to the verified owner and account generation present
    /// at entry. A server-side 401 triggers at most one same-owner refresh and
    /// replay; account switches abort instead of inheriting the new token.
    /// The forced refresh verifies the identity against Quipsly's canonical
    /// session-check endpoint before the replay. If one feature endpoint still
    /// returns 401 after that verification, the denial belongs to that feature;
    /// it must not evict an otherwise valid account from the entire app. Callers
    /// own decoding and handling every returned HTTP status.
    func authenticatedData(
        for originalRequest: URLRequest,
        session: URLSession = .shared,
        allowOfflineRecovery: Bool = false,
        expectedOwnerAccountID: String? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        guard getKeychainItem(account: "refreshToken") != nil else {
            setSignedOutState()
            throw AuthenticatedRequestError.signInRequired
        }
        let ownerBinding = try authenticatedOwnerBinding(expectedOwnerAccountID: expectedOwnerAccountID)

        if accessMode == .offlineCachedIdentity && !allowOfflineRecovery {
            throw AuthenticatedRequestError.offlineAccess
        }

        let refreshedForInitialRequest = await refreshAccessTokenIfNeeded(
            force: false,
            allowOfflineRecovery: allowOfflineRecovery
        )
        try validateAuthenticatedOwnerBinding(ownerBinding)
        guard refreshedForInitialRequest, let firstToken = getAccessToken() else {
            throw hasProtectedOfflineAccess
                ? AuthenticatedRequestError.offlineAccess
                : AuthenticatedRequestError.refreshFailed
        }
        try validateAuthenticatedOwnerBinding(ownerBinding)

        let firstResult: (Data, HTTPURLResponse)
        do {
            firstResult = try await sendAuthenticated(
                originalRequest,
                token: firstToken,
                session: session
            )
        } catch {
            try validateAuthenticatedOwnerBinding(ownerBinding)
            if isNetworkAvailabilityError(error) {
                enterProtectedOfflineAccess(reason: error.localizedDescription)
                throw AuthenticatedRequestError.offlineAccess
            }
            throw error
        }
        try validateAuthenticatedOwnerBinding(ownerBinding)
        // A reachable Nest endpoint can fail independently (for example, media
        // upload storage may be unavailable while sessions and notes are fine).
        // Preserve the authenticated shell and let the owning feature handle
        // every non-authentication HTTP status. Only transport failures prove
        // that protected offline access is necessary.
        guard firstResult.1.statusCode == 401 else {
            return firstResult
        }

        // Another request may already have rotated the rejected token. Reuse that
        // fresh value instead of forcing a second refresh after the same 401 wave.
        let retryToken: String
        if let currentToken = getAccessToken(), currentToken != firstToken {
            retryToken = currentToken
        } else {
            let refreshedForRetry = await refreshAccessTokenIfNeeded(
                force: true,
                allowOfflineRecovery: allowOfflineRecovery
            )
            try validateAuthenticatedOwnerBinding(ownerBinding)
            guard refreshedForRetry, let refreshedToken = getAccessToken() else {
                throw hasProtectedOfflineAccess
                    ? AuthenticatedRequestError.offlineAccess
                    : AuthenticatedRequestError.refreshFailed
            }
            retryToken = refreshedToken
        }
        try validateAuthenticatedOwnerBinding(ownerBinding)

        let retryResult: (Data, HTTPURLResponse)
        do {
            retryResult = try await sendAuthenticated(
                originalRequest,
                token: retryToken,
                session: session
            )
        } catch {
            try validateAuthenticatedOwnerBinding(ownerBinding)
            if isNetworkAvailabilityError(error) {
                enterProtectedOfflineAccess(reason: error.localizedDescription)
                throw AuthenticatedRequestError.offlineAccess
            }
            throw error
        }
        try validateAuthenticatedOwnerBinding(ownerBinding)
        return retryResult
    }

    /// Downloads a potentially large authenticated source without first
    /// materializing its bytes in memory. The same verified-owner, proactive
    /// refresh, one-time 401 replay, endpoint-scoped authorization, and
    /// account-switch rules as authenticatedData apply. Callers must move or
    /// delete the returned temporary file after validating the HTTP status.
    func authenticatedDownload(
        for originalRequest: URLRequest,
        session: URLSession = .shared,
        allowOfflineRecovery: Bool = false,
        expectedOwnerAccountID: String? = nil
    ) async throws -> (URL, HTTPURLResponse) {
        guard getKeychainItem(account: "refreshToken") != nil else {
            setSignedOutState()
            throw AuthenticatedRequestError.signInRequired
        }
        let ownerBinding = try authenticatedOwnerBinding(
            expectedOwnerAccountID: expectedOwnerAccountID
        )

        if accessMode == .offlineCachedIdentity && !allowOfflineRecovery {
            throw AuthenticatedRequestError.offlineAccess
        }

        let refreshedForInitialRequest = await refreshAccessTokenIfNeeded(
            force: false,
            allowOfflineRecovery: allowOfflineRecovery
        )
        try validateAuthenticatedOwnerBinding(ownerBinding)
        guard refreshedForInitialRequest, let firstToken = getAccessToken() else {
            throw hasProtectedOfflineAccess
                ? AuthenticatedRequestError.offlineAccess
                : AuthenticatedRequestError.refreshFailed
        }
        try validateAuthenticatedOwnerBinding(ownerBinding)

        let firstResult: (URL, HTTPURLResponse)
        do {
            firstResult = try await sendAuthenticatedDownload(
                originalRequest,
                token: firstToken,
                session: session
            )
        } catch {
            try validateAuthenticatedOwnerBinding(ownerBinding)
            if isNetworkAvailabilityError(error) {
                enterProtectedOfflineAccess(reason: error.localizedDescription)
                throw AuthenticatedRequestError.offlineAccess
            }
            throw error
        }
        do {
            try validateAuthenticatedOwnerBinding(ownerBinding)
        } catch {
            try? FileManager.default.removeItem(at: firstResult.0)
            throw error
        }
        guard firstResult.1.statusCode == 401 else {
            return firstResult
        }
        try? FileManager.default.removeItem(at: firstResult.0)

        let retryToken: String
        if let currentToken = getAccessToken(), currentToken != firstToken {
            retryToken = currentToken
        } else {
            let refreshedForRetry = await refreshAccessTokenIfNeeded(
                force: true,
                allowOfflineRecovery: allowOfflineRecovery
            )
            try validateAuthenticatedOwnerBinding(ownerBinding)
            guard refreshedForRetry, let refreshedToken = getAccessToken() else {
                throw hasProtectedOfflineAccess
                    ? AuthenticatedRequestError.offlineAccess
                    : AuthenticatedRequestError.refreshFailed
            }
            retryToken = refreshedToken
        }
        try validateAuthenticatedOwnerBinding(ownerBinding)

        let retryResult: (URL, HTTPURLResponse)
        do {
            retryResult = try await sendAuthenticatedDownload(
                originalRequest,
                token: retryToken,
                session: session
            )
        } catch {
            try validateAuthenticatedOwnerBinding(ownerBinding)
            if isNetworkAvailabilityError(error) {
                enterProtectedOfflineAccess(reason: error.localizedDescription)
                throw AuthenticatedRequestError.offlineAccess
            }
            throw error
        }
        do {
            try validateAuthenticatedOwnerBinding(ownerBinding)
        } catch {
            try? FileManager.default.removeItem(at: retryResult.0)
            throw error
        }
        guard retryResult.1.statusCode != 401 else {
            try? FileManager.default.removeItem(at: retryResult.0)
            signOut()
            throw AuthenticatedRequestError.sessionRejected
        }
        return retryResult
    }

    func stableOwnerSnapshot() -> StableOwnerSnapshot? {
        guard let ownerAccountID = Self.currentStoredOwnerID(),
              Self.normalizedOwnerID(accountOwnerID) == ownerAccountID else {
            return nil
        }
        return StableOwnerSnapshot(
            ownerAccountID: ownerAccountID,
            generation: accountIdentityGeneration
        )
    }

    func matchesStableOwnerSnapshot(_ snapshot: StableOwnerSnapshot) -> Bool {
        snapshot.generation == accountIdentityGeneration
            && Self.currentStoredOwnerID() == snapshot.ownerAccountID
            && Self.normalizedOwnerID(accountOwnerID) == snapshot.ownerAccountID
    }

    private func authenticatedOwnerBinding(
        expectedOwnerAccountID: String?
    ) throws -> AuthenticatedOwnerBinding {
        let boundOwnerAccountID: String
        if let expectedOwnerAccountID {
            guard let normalizedExpectedOwnerAccountID = Self.normalizedOwnerID(expectedOwnerAccountID) else {
                throw AuthenticatedRequestError.accountChanged
            }
            boundOwnerAccountID = normalizedExpectedOwnerAccountID
        } else {
            guard let currentOwnerAccountID = Self.currentStoredOwnerID() else {
                throw AuthenticatedRequestError.accountChanged
            }
            boundOwnerAccountID = currentOwnerAccountID
        }

        guard Self.currentStoredOwnerID() == boundOwnerAccountID,
              Self.normalizedOwnerID(accountOwnerID) == boundOwnerAccountID else {
            throw AuthenticatedRequestError.accountChanged
        }
        return AuthenticatedOwnerBinding(
            ownerAccountID: boundOwnerAccountID,
            generation: accountIdentityGeneration
        )
    }

    private func validateAuthenticatedOwnerBinding(
        _ binding: AuthenticatedOwnerBinding
    ) throws {
        guard binding.generation == accountIdentityGeneration,
              Self.currentStoredOwnerID() == binding.ownerAccountID,
              Self.normalizedOwnerID(accountOwnerID) == binding.ownerAccountID else {
            throw AuthenticatedRequestError.accountChanged
        }
    }

    private func storedSessionBindingMatches(
        _ binding: StoredSessionBinding,
        expectedRefreshToken: String
    ) -> Bool {
        binding.generation == accountIdentityGeneration
            && getKeychainItem(account: "refreshToken") == expectedRefreshToken
            && Self.currentStoredOwnerID() == binding.ownerAccountID
            && Self.normalizedOwnerID(accountOwnerID) == binding.ownerAccountID
    }

    private func validateStoredSessionBinding(
        _ binding: StoredSessionBinding,
        expectedRefreshToken: String
    ) throws {
        guard storedSessionBindingMatches(binding, expectedRefreshToken: expectedRefreshToken) else {
            throw CancellationError()
        }
    }

    private func performAccessTokenRefresh(
        refreshToken: String,
        storedSessionBinding: StoredSessionBinding
    ) async -> Bool {
        var expectedRefreshToken = refreshToken
        do {
            try Task.checkCancellation()
            try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: expectedRefreshToken)
            let config = try await fetchFirebaseConfig()
            try Task.checkCancellation()
            try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: expectedRefreshToken)
            let refreshed = try await refreshFirebaseToken(refreshToken: refreshToken, config: config)
            guard let idToken = refreshed.id_token,
                  let nextRefreshToken = refreshed.refresh_token else {
                throw NSError(domain: "Auth", code: 2, userInfo: [NSLocalizedDescriptionKey: "Firebase did not refresh the native session token."])
            }

            try Task.checkCancellation()
            try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: expectedRefreshToken)
            let account = try await fetchFirebaseAccount(idToken: idToken, config: config)
            try Task.checkCancellation()
            try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: expectedRefreshToken)
            guard account.emailVerified == true else {
                let freshLinkSent = (try? await sendEmailVerification(idToken: idToken, config: config)) != nil
                try Task.checkCancellation()
                try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: expectedRefreshToken)
                throw NativeAuthFlowError.emailVerificationRequired(freshLinkSent: freshLinkSent)
            }

            let expiresInSeconds = Int64(refreshed.expires_in ?? "3600") ?? 3600
            // Preserve a rotated refresh token only after Firebase confirms the
            // mailbox remains verified. The Quipsly owner binding is unchanged
            // until Nest independently accepts the refreshed bearer token.
            guard saveNativeCredentials(
                accessToken: idToken,
                refreshToken: nextRefreshToken,
                expiresInSeconds: expiresInSeconds
            ) else {
                let storageMessage = credentialStorageError().localizedDescription
                signOut()
                errorMessage = storageMessage
                return false
            }
            expectedRefreshToken = nextRefreshToken
            try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: expectedRefreshToken)
            let verifiedSession = try await verifyQuipslyNativeSession(accessToken: idToken)
            try Task.checkCancellation()
            try validateStoredSessionBinding(storedSessionBinding, expectedRefreshToken: expectedRefreshToken)
            guard saveVerifiedNativeIdentity(
                verifiedSession,
                fallbackEmail: account.email ?? userEmail,
                fallbackDisplayName: account.displayName ?? userName
            ), markIdentityVerified() else {
                let storageMessage = credentialStorageError().localizedDescription
                signOut()
                errorMessage = storageMessage
                return false
            }
            setOnlineState()
            return true
        } catch {
            if error is CancellationError
                || !storedSessionBindingMatches(storedSessionBinding, expectedRefreshToken: expectedRefreshToken) {
                return false
            }
            handleSessionRefreshFailure(error)
            return false
        }
    }

    private func sendAuthenticated(
        _ originalRequest: URLRequest,
        token: String,
        session: URLSession
    ) async throws -> (Data, HTTPURLResponse) {
        var request = originalRequest
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        return (data, http)
    }

    private func sendAuthenticatedDownload(
        _ originalRequest: URLRequest,
        token: String,
        session: URLSession
    ) async throws -> (URL, HTTPURLResponse) {
        var request = originalRequest
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (temporaryURL, response) = try await session.download(for: request)
        guard let http = response as? HTTPURLResponse else {
            try? FileManager.default.removeItem(at: temporaryURL)
            throw URLError(.badServerResponse)
        }
        return (temporaryURL, http)
    }

    func signOut() {
        interactiveAuthAttemptID = nil
        isAuthenticating = false
        GIDSignIn.sharedInstance.signOut()
        refreshTask?.cancel()
        refreshTask = nil
        refreshTaskID = nil
        deleteKeychainItem(account: "accessToken")
        deleteKeychainItem(account: "refreshToken")
        deleteKeychainItem(account: "expiresAtEpochSeconds")
        deleteKeychainItem(account: "userEmail")
        deleteKeychainItem(account: "userName")
        deleteKeychainItem(account: "accountOwnerID")
        deleteKeychainItem(account: "verifiedIdentityAtEpochSeconds")
        CaptureSessionClient.clearProtectedSessionCache()
        CaptureTodayClient.clearProtectedCache()
        CaptureWorkClient.clearProtectedCache()
        CaptureTranscriptCorrectionClient.clearProtectedCache()
        CaptureTranscriptCorrectionDraftStore.clearAll()
        MobileEpisodeManuscriptClient.clearProtectedCache()
        MobileEpisodeWatchClient.clearProtectedCache()
        MobileEpisodeChatClient.clearProtectedCache()
        MobileSessionConversationClient.clearProtectedCache()
        setSignedOutState()
        userName = nil
        userEmail = nil
        accountOwnerID = nil
        errorMessage = nil
        statusMessage = nil
        recentlyCreatedEmail = nil
        publishAccountIdentityChange()
    }

    nonisolated func getAccessToken() -> String? {
        Self.currentStoredAccessToken()
    }

    nonisolated static func currentStoredAccessToken() -> String? {
        guard let token = getKeychainItem(account: "accessToken"), !isStoredTokenExpiringSoon() else {
            return nil
        }
        return token
    }

    /// Opaque Quipsly actor binding used only to partition protected local data.
    /// A refresh token must still exist; signing out therefore hides every local
    /// account partition without deleting a source file.
    nonisolated static func currentStoredOwnerID() -> String? {
        #if DEBUG && targetEnvironment(simulator)
        // The deterministic UI-test identity is deliberately launch-scoped and
        // has no network authority. Keep every protected store on the same
        // explicit owner even when an unsigned simulator build cannot persist
        // the marker credential in Keychain. Release and physical-device builds
        // can never enter this path.
        if let previewOwner = CaptureLaunchConfiguration.shareExtensionUITestOwner {
            return normalizedOwnerID(previewOwner)
        }
        #endif
        guard getKeychainItem(account: "refreshToken") != nil else { return nil }
        return normalizedOwnerID(getKeychainItem(account: "accountOwnerID"))
    }

    private func fetchFirebaseConfig() async throws -> FirebaseClientConfig {
        guard let url = URL(string: "\(authUrlBase)/api/mac/firebase-client-config") else {
            throw NSError(domain: "Auth", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid Quipsly API base URL."])
        }

        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        let payload = try JSONDecoder().decode(FirebaseClientConfigResponse.self, from: data)
        guard http.statusCode < 400, payload.ok, let firebase = payload.firebase, !firebase.apiKey.isEmpty else {
            throw NSError(domain: "Auth", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Firebase client configuration is unavailable."])
        }
        if firebase.authEmulatorUrl != nil && firebase.validatedAuthEmulatorURL == nil {
            throw NSError(domain: "Auth", code: 3, userInfo: [NSLocalizedDescriptionKey: "Quipsly returned an invalid Firebase Auth Emulator origin."])
        }
        return firebase
    }

    private func signInWithFirebasePassword(email: String, password: String, config: FirebaseClientConfig) async throws -> FirebasePasswordSignInResponse {
        guard let url = URL(string: "\(config.identityToolkitBaseURL)/v1/accounts:signInWithPassword?key=\(config.apiKey)") else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email,
            "password": password,
            "returnSecureToken": true,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = try JSONDecoder().decode(FirebasePasswordSignInResponse.self, from: data)
        guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
            throw firebaseRequestError(
                statusCode: (response as? HTTPURLResponse)?.statusCode ?? 400,
                firebaseCode: payload.error?.message,
                fallback: "Firebase sign-in failed."
            )
        }
        return payload
    }

    private func signInWithFirebaseGoogle(
        googleIDToken: String,
        config: FirebaseClientConfig
    ) async throws -> FirebaseFederatedSignInResponse {
        guard let url = URL(
            string: "\(config.identityToolkitBaseURL)/v1/accounts:signInWithIdp?key=\(config.apiKey)"
        ) else {
            throw URLError(.badURL)
        }

        var formComponents = URLComponents()
        formComponents.queryItems = [
            URLQueryItem(name: "id_token", value: googleIDToken),
            URLQueryItem(name: "providerId", value: "google.com"),
        ]
        guard let postBody = formComponents.percentEncodedQuery else {
            throw NativeAuthFlowError.googleCredentialUnavailable
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "postBody": postBody,
            "requestUri": "http://localhost",
            "returnIdpCredential": true,
            "returnSecureToken": true,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = try JSONDecoder().decode(FirebaseFederatedSignInResponse.self, from: data)
        guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
            let code = normalizedFirebaseErrorCode(payload.error?.message)
            if let code, [
                "ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL",
                "EMAIL_EXISTS",
                "FEDERATED_USER_ID_ALREADY_LINKED",
            ].contains(code) {
                throw NativeAuthFlowError.googleAccountNeedsLinking
            }
            throw firebaseRequestError(
                statusCode: (response as? HTTPURLResponse)?.statusCode ?? 400,
                firebaseCode: payload.error?.message,
                fallback: "Firebase could not finish Google sign-in."
            )
        }
        return payload
    }

    private func signInWithFirebaseApple(
        appleIDToken: String,
        rawNonce: String,
        config: FirebaseClientConfig
    ) async throws -> FirebaseFederatedSignInResponse {
        guard !appleIDToken.isEmpty, !rawNonce.isEmpty else {
            throw NativeAuthFlowError.appleCredentialUnavailable
        }
        guard let url = URL(
            string: "\(config.identityToolkitBaseURL)/v1/accounts:signInWithIdp?key=\(config.apiKey)"
        ) else {
            throw URLError(.badURL)
        }

        var formComponents = URLComponents()
        formComponents.queryItems = [
            URLQueryItem(name: "id_token", value: appleIDToken),
            URLQueryItem(name: "providerId", value: "apple.com"),
            URLQueryItem(name: "nonce", value: rawNonce),
        ]
        guard let postBody = formComponents.percentEncodedQuery else {
            throw NativeAuthFlowError.appleCredentialUnavailable
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "postBody": postBody,
            "requestUri": "http://localhost",
            "returnIdpCredential": true,
            "returnSecureToken": true,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = try JSONDecoder().decode(FirebaseFederatedSignInResponse.self, from: data)
        guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
            let code = normalizedFirebaseErrorCode(payload.error?.message)
            if let code, [
                "ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL",
                "EMAIL_EXISTS",
                "FEDERATED_USER_ID_ALREADY_LINKED",
            ].contains(code) {
                throw NativeAuthFlowError.appleAccountNeedsLinking
            }
            throw firebaseRequestError(
                statusCode: (response as? HTTPURLResponse)?.statusCode ?? 400,
                firebaseCode: payload.error?.message,
                fallback: "Firebase could not finish Apple sign-in."
            )
        }
        return payload
    }

    private func createFirebasePasswordAccount(
        email: String,
        password: String,
        config: FirebaseClientConfig
    ) async throws -> FirebasePasswordSignInResponse {
        guard let url = URL(string: "\(config.identityToolkitBaseURL)/v1/accounts:signUp?key=\(config.apiKey)") else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email,
            "password": password,
            "returnSecureToken": true,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = try JSONDecoder().decode(FirebasePasswordSignInResponse.self, from: data)
        guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
            throw firebaseRequestError(
                statusCode: (response as? HTTPURLResponse)?.statusCode ?? 400,
                firebaseCode: payload.error?.message,
                fallback: "Firebase account creation failed."
            )
        }
        return payload
    }

    private func fetchFirebaseAccount(idToken: String, config: FirebaseClientConfig) async throws -> FirebaseAccountInfo {
        guard let url = URL(string: "\(config.identityToolkitBaseURL)/v1/accounts:lookup?key=\(config.apiKey)") else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["idToken": idToken])

        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = try JSONDecoder().decode(FirebaseAccountLookupResponse.self, from: data)
        guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
            throw firebaseRequestError(
                statusCode: (response as? HTTPURLResponse)?.statusCode ?? 400,
                firebaseCode: payload.error?.message,
                fallback: "Firebase could not verify this account."
            )
        }
        guard let account = payload.users?.first else {
            throw NSError(
                domain: "FirebaseAuth",
                code: 401,
                userInfo: [NSLocalizedDescriptionKey: "Firebase did not return current account verification state."]
            )
        }
        return account
    }

    private func sendEmailVerification(idToken: String, config: FirebaseClientConfig) async throws {
        try await sendFirebaseOOBCode(
            body: [
                "requestType": "VERIFY_EMAIL",
                "idToken": idToken,
            ],
            config: config,
            fallback: "Firebase could not send an email verification link."
        )
    }

    private func sendPasswordResetEmail(email: String, config: FirebaseClientConfig) async throws {
        try await sendFirebaseOOBCode(
            body: [
                "requestType": "PASSWORD_RESET",
                "email": email,
            ],
            config: config,
            fallback: "Firebase could not start password recovery."
        )
    }

    private func sendFirebaseOOBCode(
        body: [String: Any],
        config: FirebaseClientConfig,
        fallback: String
    ) async throws {
        guard let url = URL(string: "\(config.identityToolkitBaseURL)/v1/accounts:sendOobCode?key=\(config.apiKey)") else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let preferredLanguage = Locale.preferredLanguages.first, !preferredLanguage.isEmpty {
            request.setValue(preferredLanguage, forHTTPHeaderField: "X-Firebase-Locale")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = try JSONDecoder().decode(FirebaseOOBResponse.self, from: data)
        guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
            throw firebaseRequestError(
                statusCode: (response as? HTTPURLResponse)?.statusCode ?? 400,
                firebaseCode: payload.error?.message,
                fallback: fallback
            )
        }
    }

    private func refreshFirebaseToken(refreshToken: String, config: FirebaseClientConfig) async throws -> FirebaseRefreshResponse {
        guard let url = URL(string: "\(config.secureTokenBaseURL)/v1/token?key=\(config.apiKey)") else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let body = "grant_type=refresh_token&refresh_token=\(refreshToken.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? refreshToken)"
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = try JSONDecoder().decode(FirebaseRefreshResponse.self, from: data)
        guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
            let baseError = firebaseRequestError(
                statusCode: (response as? HTTPURLResponse)?.statusCode ?? 400,
                firebaseCode: payload.error?.message,
                fallback: "Firebase could not refresh this session."
            )
            throw NSError(
                domain: "FirebaseRefresh",
                code: baseError.code,
                userInfo: baseError.userInfo
            )
        }
        return payload
    }

    private func verifyQuipslyNativeSession(accessToken: String) async throws -> VerifiedNativeSession {
        guard let url = URL(string: "\(authUrlBase)/api/mac/session-check") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = try JSONDecoder().decode(NativeSessionCheckResponse.self, from: data)
        guard let http = response as? HTTPURLResponse, http.statusCode < 400, payload.ok == true || payload.authenticated == true else {
            throw NSError(domain: "QuipslySession", code: (response as? HTTPURLResponse)?.statusCode ?? 401, userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Quipsly could not verify this native session."])
        }

        guard let ownerID = Self.normalizedOwnerID(payload.user?.id) else {
            throw NSError(
                domain: "QuipslySession",
                code: 401,
                userInfo: [NSLocalizedDescriptionKey: "Quipsly did not return an account identity for protected local data."]
            )
        }
        let email = payload.user?.primaryEmail ?? payload.user?.email
        return VerifiedNativeSession(
            ownerAccountID: ownerID,
            email: email,
            name: payload.user?.name ?? email
        )
    }

    private func saveVerifiedNativeSession(
        accessToken: String,
        refreshToken: String,
        expiresInSeconds: Int64,
        email: String?,
        displayName: String?,
        ownerAccountID: String
    ) -> Bool {
        let credentialsSaved = saveNativeCredentials(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresInSeconds: expiresInSeconds
        )
        let identitySaved = saveVerifiedNativeIdentity(
            VerifiedNativeSession(
                ownerAccountID: ownerAccountID,
                email: email,
                name: displayName
            ),
            fallbackEmail: email,
            fallbackDisplayName: displayName
        )
        return credentialsSaved && identitySaved
    }

    private func saveNativeCredentials(
        accessToken: String,
        refreshToken: String,
        expiresInSeconds: Int64
    ) -> Bool {
        let accessSaved = saveKeychainItem(account: "accessToken", value: accessToken)
        let refreshSaved = saveKeychainItem(account: "refreshToken", value: refreshToken)
        let expirySaved = saveKeychainItem(account: "expiresAtEpochSeconds", value: String(Int64(Date().timeIntervalSince1970) + expiresInSeconds))
        return accessSaved && refreshSaved && expirySaved
    }

    private func saveVerifiedNativeIdentity(
        _ verifiedSession: VerifiedNativeSession,
        fallbackEmail: String?,
        fallbackDisplayName: String?
    ) -> Bool {
        accountOwnerID = verifiedSession.ownerAccountID
        var saved = saveKeychainItem(account: "accountOwnerID", value: verifiedSession.ownerAccountID)

        let email = verifiedSession.email ?? fallbackEmail
        let displayName = verifiedSession.name ?? fallbackDisplayName ?? email
        if let email, !email.isEmpty {
            userEmail = email
            saved = saveKeychainItem(account: "userEmail", value: email) && saved
        }
        if let displayName, !displayName.isEmpty {
            userName = displayName
            saved = saveKeychainItem(account: "userName", value: displayName) && saved
        } else if let email, !email.isEmpty {
            userName = email
            saved = saveKeychainItem(account: "userName", value: email) && saved
        }
        return saved
    }

    private func markIdentityVerified() -> Bool {
        saveKeychainItem(
            account: "verifiedIdentityAtEpochSeconds",
            value: String(Int64(Date().timeIntervalSince1970))
        )
    }

    private func credentialStorageError() -> NSError {
        NSError(
            domain: "QuipslyCredentialStorage",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "This iPhone could not protect the refreshed Quipsly session in Keychain. Sign in again after device storage is available."]
        )
    }

    private func setOnlineState() {
        isAuthenticated = true
        accessMode = .online
        offlineAccessMessage = nil
        errorMessage = nil
        publishAccountIdentityChange()
    }

    private func setSignedOutState() {
        isAuthenticated = false
        accessMode = .signedOut
        offlineAccessMessage = nil
    }

    private func enterProtectedOfflineAccess(reason: String) {
        isAuthenticated = false
        guard hasRecentlyVerifiedCachedIdentity() else {
            accessMode = .signedOut
            offlineAccessMessage = nil
            errorMessage = reason
            return
        }

        accessMode = .offlineCachedIdentity
        offlineAccessMessage = "Nest could not verify this saved identity right now. Protected local recordings and a private work-capture outbox remain available; all network actions are disabled."
        errorMessage = offlineAccessMessage
        publishAccountIdentityChange()
    }

    func suspendNetworkActionsForCachedFallback(reason: String) {
        enterProtectedOfflineAccess(reason: reason)
    }

    private func handleSessionRefreshFailure(_ error: Error) {
        if isDefinitiveAuthenticationFailure(error) {
            signOut()
            errorMessage = humanAuthError(error)
            return
        }
        enterProtectedOfflineAccess(reason: humanAuthError(error))
    }

    private func hasRecentlyVerifiedCachedIdentity() -> Bool {
        guard getKeychainItem(account: "refreshToken") != nil,
              Self.currentStoredOwnerID() != nil,
              let email = getKeychainItem(account: "userEmail"),
              !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let raw = getKeychainItem(account: "verifiedIdentityAtEpochSeconds"),
              let verifiedAt = TimeInterval(raw) else {
            return false
        }
        let age = Date().timeIntervalSince1970 - verifiedAt
        return age >= 0 && age <= Self.cachedIdentityLifetimeSeconds
    }

    private func isDefinitiveAuthenticationFailure(_ error: Error) -> Bool {
        if error is NativeAuthFlowError {
            return true
        }
        let nsError = error as NSError
        if nsError.domain == "FirebaseRefresh" {
            return [400, 401, 403].contains(nsError.code)
        }
        if nsError.domain == "QuipslySession" {
            return [401, 403].contains(nsError.code)
        }
        return false
    }

    private func isNetworkAvailabilityError(_ error: Error) -> Bool {
        let nsError = error as NSError
        guard nsError.domain == NSURLErrorDomain else { return false }
        let codes: Set<Int> = [
            URLError.notConnectedToInternet.rawValue,
            URLError.networkConnectionLost.rawValue,
            URLError.cannotConnectToHost.rawValue,
            URLError.cannotFindHost.rawValue,
            URLError.dnsLookupFailed.rawValue,
            URLError.timedOut.rawValue,
            URLError.internationalRoamingOff.rawValue,
            URLError.dataNotAllowed.rawValue,
            URLError.secureConnectionFailed.rawValue,
            URLError.serverCertificateHasBadDate.rawValue,
            URLError.serverCertificateUntrusted.rawValue,
            URLError.serverCertificateHasUnknownRoot.rawValue,
            URLError.serverCertificateNotYetValid.rawValue,
            URLError.clientCertificateRejected.rawValue,
            URLError.clientCertificateRequired.rawValue,
            URLError.cannotLoadFromNetwork.rawValue,
            URLError.resourceUnavailable.rawValue,
            URLError.badServerResponse.rawValue,
        ]
        return codes.contains(nsError.code)
    }

    private func isTokenExpiringSoon() -> Bool {
        Self.isStoredTokenExpiringSoon()
    }

    nonisolated private func isStoredTokenExpiringSoon() -> Bool {
        Self.isStoredTokenExpiringSoon()
    }

    nonisolated private static func isStoredTokenExpiringSoon() -> Bool {
        guard let raw = getKeychainItem(account: "expiresAtEpochSeconds"),
              let expiresAt = Int64(raw) else {
            return true
        }
        return expiresAt <= Int64(Date().timeIntervalSince1970) + tokenRefreshSkewSeconds
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }

    private func publishAccountIdentityChange() {
        let publishedOwnerAccountID = Self.normalizedOwnerID(accountOwnerID)
        ShareCaptureBridge.publishOwner(publishedOwnerAccountID)
        if publishedOwnerAccountID != lastPublishedOwnerAccountID {
            accountIdentityGeneration &+= 1
            lastPublishedOwnerAccountID = publishedOwnerAccountID
        }
        NotificationCenter.default.post(
            name: .quipslyCaptureAccountIdentityDidChange,
            object: publishedOwnerAccountID
        )
    }

    private func humanAuthError(_ error: Error) -> String {
        if let flowError = error as? NativeAuthFlowError {
            return flowError.localizedDescription
        }
        if let code = firebaseErrorCode(error) {
            return firebaseErrorMessage(code)
        }
        let message = error.localizedDescription
        if message == "INVALID_PASSWORD" || message == "EMAIL_NOT_FOUND" || message == "INVALID_LOGIN_CREDENTIALS" {
            return firebaseErrorMessage("INVALID_LOGIN_CREDENTIALS")
        }
        if message.contains("Firebase client configuration") {
            return message
        }
        if message.contains("Quipsly could not verify") {
            return message
        }
        return message
    }

    private func firebaseErrorMessage(_ code: String?) -> String {
        let normalizedCode = normalizedFirebaseErrorCode(code)
        switch normalizedCode {
        case "INVALID_PASSWORD", "EMAIL_NOT_FOUND", "INVALID_LOGIN_CREDENTIALS":
            return "That email/password did not open Quipsly. If this account began with Google, use Continue with Google above—do not create a duplicate account."
        case "EMAIL_EXISTS":
            return "That email already has a Firebase login. Use Continue with Google if it is a Google account, or switch to password Sign in."
        case "WEAK_PASSWORD":
            return "Firebase rejected that password as too weak. Use at least 8 characters; a short phrase is better than a tiny secret."
        case "INVALID_EMAIL", "MISSING_EMAIL":
            return "That email address does not look valid yet."
        case "OPERATION_NOT_ALLOWED":
            return "Email/password sign-in is not available for this Quipsly Firebase project right now. Use Continue with Google or contact support."
        case "USER_DISABLED":
            return "This Firebase account is disabled."
        case "TOO_MANY_ATTEMPTS_TRY_LATER":
            return "Firebase temporarily slowed this account down after repeated attempts. Give it a little time, then try again or use recovery."
        default:
            return code ?? "Firebase could not finish that authentication step."
        }
    }

    private func firebaseRequestError(
        statusCode: Int,
        firebaseCode: String?,
        fallback: String
    ) -> NSError {
        let normalizedCode = normalizedFirebaseErrorCode(firebaseCode)
        return NSError(
            domain: "FirebaseAuth",
            code: statusCode,
            userInfo: [
                NSLocalizedDescriptionKey: normalizedCode == nil
                    ? fallback
                    : firebaseErrorMessage(normalizedCode),
                "FirebaseErrorCode": normalizedCode ?? "",
            ]
        )
    }

    private func firebaseErrorCode(_ error: Error) -> String? {
        let nsError = error as NSError
        return normalizedFirebaseErrorCode(nsError.userInfo["FirebaseErrorCode"] as? String)
    }

    private func normalizedFirebaseErrorCode(_ value: String?) -> String? {
        guard let value else { return nil }
        let code = value
            .split(whereSeparator: { $0 == " " || $0 == ":" })
            .first
            .map(String.init)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return code?.isEmpty == false ? code : nil
    }

    private static var googleClientConfiguration: GoogleClientConfiguration? {
        guard
            let iosClientID = normalizedGoogleClientID(
                Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String
            ),
            let serverClientID = normalizedGoogleClientID(
                Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String
            )
        else {
            return nil
        }
        return GoogleClientConfiguration(
            iosClientID: iosClientID,
            serverClientID: serverClientID
        )
    }

    private static func normalizedGoogleClientID(_ rawValue: String?) -> String? {
        guard let value = rawValue?.trimmingCharacters(in: .whitespacesAndNewlines),
              value.hasSuffix(".apps.googleusercontent.com"),
              value.count <= 256 else {
            return nil
        }
        return value
    }

    private static func activePresentationViewController() -> UIViewController? {
        let foregroundScenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
        let window = foregroundScenes
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
            ?? foregroundScenes.flatMap(\.windows).first
        guard let root = window?.rootViewController else { return nil }
        return topPresentationViewController(from: root)
    }

    private static func topPresentationViewController(
        from viewController: UIViewController
    ) -> UIViewController {
        if let presented = viewController.presentedViewController {
            return topPresentationViewController(from: presented)
        }
        if let navigation = viewController as? UINavigationController,
           let visible = navigation.visibleViewController {
            return topPresentationViewController(from: visible)
        }
        if let tabs = viewController as? UITabBarController,
           let selected = tabs.selectedViewController {
            return topPresentationViewController(from: selected)
        }
        return viewController
    }

    private static func isGoogleSignInCancellation(_ error: Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == kGIDSignInErrorDomain
            && nsError.code == GIDSignInError.canceled.rawValue
    }

    // MARK: - Keychain Helpers

    @discardableResult
    private func saveKeychainItem(account: String, value: String) -> Bool {
        let data = value.data(using: .utf8)!
        let lookup: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: account,
        ]
        let replacement: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]

        // Update by stable item identity so token rotation cannot leave the old
        // value behind. Only insert when the item genuinely does not exist.
        let updateStatus = SecItemUpdate(lookup as CFDictionary, replacement as CFDictionary)
        if updateStatus == errSecSuccess { return true }
        guard updateStatus == errSecItemNotFound else { return false }
        var insert = lookup
        insert.merge(replacement) { _, new in new }
        return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
    }

    nonisolated private static func getKeychainItem(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: kCFBooleanTrue!,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)

        if status == errSecSuccess, let data = dataTypeRef as? Data {
            return String(data: data, encoding: .utf8)
        }
        return nil
    }

    nonisolated private static func saveKeychainItemForUITest(account: String, value: String) {
        #if DEBUG && targetEnvironment(simulator)
        let data = Data(value.utf8)
        let lookup: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        let replacement: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updateStatus = SecItemUpdate(lookup as CFDictionary, replacement as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var insert = lookup
            insert.merge(replacement) { _, new in new }
            SecItemAdd(insert as CFDictionary, nil)
        }
        #endif
    }

    nonisolated private static func deleteKeychainItemForUITest(account: String) {
        #if DEBUG && targetEnvironment(simulator)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        #endif
    }

    nonisolated private func getKeychainItem(account: String) -> String? {
        Self.getKeychainItem(account: account)
    }

    private func deleteKeychainItem(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
