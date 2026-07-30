import Foundation
import Security
import SwiftUI
import QuipslyVideoCore
import CryptoKit

#if os(macOS)
import AppKit
#endif

private struct FirebaseClientConfigEnvelope: Decodable {
    struct FirebaseClientConfig: Decodable {
        let apiKey: String
        let authDomain: String
        let projectId: String
        let storageBucket: String
        let messagingSenderId: String
        let appId: String
    }

    let ok: Bool
    let firebase: FirebaseClientConfig?
    let error: String?
}

private struct FirebasePasswordSignInResponse: Decodable {
    let idToken: String
    let refreshToken: String
    let expiresIn: String
    let localId: String
    let email: String
}

private struct FirebaseRefreshResponse: Decodable {
    let id_token: String
    let refresh_token: String
    let expires_in: String
    let user_id: String
}

private struct FirebaseCustomTokenSignInResponse: Decodable {
    let idToken: String
    let refreshToken: String
    let expiresIn: String
}

private struct FirebaseRESTErrorEnvelope: Decodable {
    struct FirebaseRESTError: Decodable {
        let message: String?
    }

    let error: FirebaseRESTError?
}

private struct NativeBrowserExchangeEnvelope: Decodable {
    struct ExchangeUser: Decodable {
        let id: String
        let email: String
    }

    let ok: Bool
    let customToken: String?
    let user: ExchangeUser?
    let code: String?
    let error: String?
}

private struct NativeBrowserExchange {
    let customToken: String
    let user: NativeBrowserExchangeEnvelope.ExchangeUser
}

private struct PendingNativeBrowserHandoff: Codable {
    let state: String
    let codeVerifier: String
    let createdAt: Date
    let baseURL: String
}

struct NativeSessionCheckEnvelope: Decodable {
    struct NativeUser: Decodable {
        let email: String
        let name: String?
        let roles: [String]
        let isStaff: Bool
    }

    struct NativeHomeNest: Decodable {
        let slug: String
        let name: String
    }

    struct NativeProject: Decodable, Identifiable {
        let id: String
        let slug: String
        let name: String
        let sourceLabel: String?
        let role: String
        let updatedAt: String
    }

    struct NativeOnboarding: Decodable {
        let freePlanSlug: String
        let freeMembershipStatus: String
        let freeMembershipCreated: Bool
        let homeNestSlug: String
    }

    struct StudioEvidenceHandoff: Decodable, Identifiable {
        let id: String
        let title: String
        let status: String
        let projectSlug: String
        let projectName: String
        let sourceTitle: String
        let sourcePath: String?
        let sourceFingerprint: String
        let annotationId: String
        let annotationRevision: Int
        let annotationKind: String
        let annotationBody: String
        let exactText: String
        let tags: [String]
        let publicWritingUseCount: Int
        let privateWritingUseCount: Int
        let humanReviewRequired: Bool
        let createdAt: String
        let updatedAt: String
    }

    struct StudioTranscriptCorrection: Decodable, Identifiable {
        let id: String
        let roomId: String
        let roomTitle: String
        let transcriptJobId: String?
        let segmentId: String
        let origin: String
        let status: String
        let startSeconds: Double
        let endSeconds: Double
        let providerSpeakerLabel: String?
        let providerText: String
        let correctedSpeakerLabel: String?
        let correctedText: String?
        let effectiveSpeakerLabel: String?
        let effectiveText: String
        let reason: String?
        let revisionCount: Int
        let playbackURL: String?
        let playbackSourceId: String?
        let humanReviewRequired: Bool
        let updatedAt: String
    }

    let ok: Bool
    let authenticated: Bool
    let user: NativeUser?
    let homeNest: NativeHomeNest?
    let onboarding: NativeOnboarding?
    let projects: [NativeProject]?
    let studioEvidenceHandoffs: [StudioEvidenceHandoff]?
    let studioTranscriptCorrections: [StudioTranscriptCorrection]?
    let error: String?
}

private enum QuipslyNativeAccountKeychain {
    static let service = "com.highground.QuipslyStudio.nativeAuth"
    static let refreshTokenAccount = "firebaseRefreshToken"
    static let browserHandoffAccount = "pendingBrowserHandoff"

    static func saveRefreshToken(_ refreshToken: String) throws {
        guard let data = refreshToken.data(using: .utf8) else { return }
        try save(data, account: refreshTokenAccount)
    }

    static func loadRefreshToken() -> String? {
        guard let data = load(account: refreshTokenAccount) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func deleteRefreshToken() {
        delete(account: refreshTokenAccount)
    }

    static func saveBrowserHandoff(_ handoff: PendingNativeBrowserHandoff) throws {
        try save(JSONEncoder().encode(handoff), account: browserHandoffAccount)
    }

    static func loadBrowserHandoff() -> PendingNativeBrowserHandoff? {
        guard let data = load(account: browserHandoffAccount) else { return nil }
        return try? JSONDecoder().decode(PendingNativeBrowserHandoff.self, from: data)
    }

    static func deleteBrowserHandoff() {
        delete(account: browserHandoffAccount)
    }

    private static func save(_ data: Data, account: String) throws {
        let identityQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true,
        ]
        let updateStatus = SecItemUpdate(
            identityQuery as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecSuccess {
            return
        }
        guard updateStatus == errSecItemNotFound else {
            throw keychainError(action: "update", status: updateStatus)
        }

        var addQuery = identityQuery
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] =
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(addQuery as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw keychainError(action: "save", status: status)
        }
    }

    private static func keychainError(
        action: String,
        status: OSStatus
    ) -> NSError {
        let systemMessage = SecCopyErrorMessageString(status, nil) as String?
        let detail = systemMessage.map { " \($0)" } ?? ""
        return NSError(
            domain: NSOSStatusErrorDomain,
            code: Int(status),
            userInfo: [
                NSLocalizedDescriptionKey:
                    "Keychain could not \(action) the native Quipsly credential "
                    + "(OSStatus \(status)).\(detail)",
            ]
        )
    }

    private static func load(account: String) -> Data? {
        if let protected = load(
            account: account,
            useDataProtectionKeychain: true
        ) {
            return protected
        }

        // Builds before the stable signing/keychain cut used the legacy macOS
        // keychain. Read it once, migrate it into the device-bound data
        // protection keychain, and delete the legacy copy only after the new
        // write succeeds. This keeps upgrades working without weakening new
        // credentials.
        guard let legacy = load(
            account: account,
            useDataProtectionKeychain: false
        ) else {
            return nil
        }
        do {
            try save(legacy, account: account)
            delete(account: account, useDataProtectionKeychain: false)
        } catch {
            // The caller may still use the legacy credential for this launch.
            // A later successful save will retry the migration.
        }
        return legacy
    }

    private static func load(
        account: String,
        useDataProtectionKeychain: Bool
    ) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseDataProtectionKeychain as String:
                useDataProtectionKeychain,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    private static func delete(account: String) {
        delete(account: account, useDataProtectionKeychain: true)
        delete(account: account, useDataProtectionKeychain: false)
    }

    private static func delete(
        account: String,
        useDataProtectionKeychain: Bool
    ) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String:
                useDataProtectionKeychain,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

@MainActor
final class QuipslyNativeAccountStore: ObservableObject {
    @Published var baseURL: String {
        didSet { UserDefaults.standard.set(baseURL, forKey: Self.baseURLKey) }
    }

    @Published var email: String {
        didSet { UserDefaults.standard.set(email, forKey: Self.emailKey) }
    }

    @Published var password: String = ""
    @Published private(set) var userEmail: String = ""
    @Published private(set) var userName: String = ""
    @Published private(set) var homeNestSlug: String = ""
    @Published private(set) var homeNestName: String = ""
    @Published private(set) var freeTierStatus: String = ""
    @Published private(set) var visibleProjects: [NativeSessionCheckEnvelope.NativeProject] = []
    @Published private(set) var studioEvidenceHandoffs: [NativeSessionCheckEnvelope.StudioEvidenceHandoff] = []
    @Published private(set) var studioTranscriptCorrections: [NativeSessionCheckEnvelope.StudioTranscriptCorrection] = []
    @Published private(set) var isStaff: Bool = false
    @Published private(set) var isBusy: Bool = false
    @Published private(set) var statusMessage: String = "Not connected yet."
    @Published private(set) var errorMessage: String = ""
    @Published private(set) var lastVerifiedAt: Date?

    private static let baseURLKey = "quipsly.nativeAccount.baseURL"
    private static let emailKey = "quipsly.nativeAccount.email"
    private static let browserHandoffLifetime: TimeInterval = 10 * 60
    private var idToken: String = ""
    private var idTokenExpiresAt: Date = .distantPast
    private var refreshToken: String?

    init() {
        baseURL = UserDefaults.standard.string(forKey: Self.baseURLKey) ?? "https://nest.quipsly.com"
        email = UserDefaults.standard.string(forKey: Self.emailKey) ?? ""
        refreshToken = QuipslyNativeAccountKeychain.loadRefreshToken()
        if refreshToken != nil {
            statusMessage = "Saved native refresh token found. Check session to verify it with Nest."
        } else if let pending = QuipslyNativeAccountKeychain.loadBrowserHandoff(),
                  Date().timeIntervalSince(pending.createdAt) <= Self.browserHandoffLifetime {
            statusMessage = "Finish the Google sign-in in your browser. Quipsly Studio is waiting for the secure return."
        } else {
            QuipslyNativeAccountKeychain.deleteBrowserHandoff()
        }
    }

    var hasSavedSession: Bool {
        refreshToken != nil
    }

    var isVerified: Bool {
        !userEmail.isEmpty && !homeNestSlug.isEmpty
    }

    var normalizedBaseURL: URL? {
        let trimmed = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withScheme = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
        return URL(string: withScheme.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }

    var agentStatusPayload: [String: Any] {
        let configuredEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let configuredEmailDomain = configuredEmail.split(separator: "@").last.map(String.init) ?? ""
        return [
            "baseURL": normalizedBaseURL?.absoluteString ?? baseURL,
            "configuredEmailPresent": !configuredEmail.isEmpty,
            "configuredEmailDomain": configuredEmailDomain,
            "passwordPresent": !password.isEmpty,
            "hasSavedSession": hasSavedSession,
            "isBusy": isBusy,
            "isVerified": isVerified,
            "verifiedEmail": userEmail,
            "userNamePresent": !userName.isEmpty,
            "homeNestSlug": homeNestSlug,
            "homeNestName": homeNestName,
            "freeTierStatus": freeTierStatus,
            "isStaff": isStaff,
            "visibleProjectCount": visibleProjects.count,
            "visibleProjectSlugs": visibleProjects.map(\.slug),
            "studioEvidenceHandoffCount": studioEvidenceHandoffs.count,
            "studioEvidenceHandoffIds": studioEvidenceHandoffs.map(\.id),
            "studioTranscriptCorrectionCount": studioTranscriptCorrections.count,
            "studioTranscriptCorrectionIds": studioTranscriptCorrections.map(\.id),
            "lastVerifiedAt": lastVerifiedAt?.ISO8601Format() ?? "",
            "statusMessage": statusMessage,
            "errorMessage": errorMessage,
            "truth": "Google signs in through Nest, which issues a state-bound one-time handoff for the exact existing Firebase UID. The Mac exchanges it for the same Firebase bearer/refresh-token identity and stores only the refresh token in the device-local Keychain."
        ]
    }

    @discardableResult
    func signInAndVerify() async -> String {
        guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return setError("Add an email before signing in.")
        }
        guard !password.isEmpty else {
            return setError("Add the Firebase password before signing in.")
        }

        return await runAuthAction(start: "Signing in with Firebase...") {
            let config = try await fetchFirebaseClientConfig()
            let signIn = try await signInWithPassword(config: config)
            try await verifyNativeSession(idToken: signIn.idToken)
            try commitVerifiedFirebaseSession(
                idToken: signIn.idToken,
                refreshToken: signIn.refreshToken,
                expiresIn: signIn.expiresIn
            )
            password = ""
            return "Native session verified for \(userEmail). Home Nest: \(homeNestSlug)."
        }
    }

    @discardableResult
    func beginBrowserSignIn() async -> String {
        await runAuthAction(start: "Preparing secure Google sign-in...") {
            guard let base = normalizedBaseURL else {
                throw NSError(domain: "QuipslyNativeAccount", code: 10, userInfo: [
                    NSLocalizedDescriptionKey: "Nest base URL is not valid.",
                ])
            }
            guard base.scheme == "https" || isLoopback(base) else {
                throw NSError(domain: "QuipslyNativeAccount", code: 11, userInfo: [
                    NSLocalizedDescriptionKey:
                        "Browser sign-in requires HTTPS, except for a local development server.",
                ])
            }

            let state = try makeBrowserHandoffState()
            let codeVerifier = try makeBrowserHandoffState()
            let codeChallenge = Data(
                SHA256.hash(data: Data(codeVerifier.utf8))
            )
                .base64EncodedString()
                .replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
            let pending = PendingNativeBrowserHandoff(
                state: state,
                codeVerifier: codeVerifier,
                createdAt: Date(),
                baseURL: base.absoluteString
            )
            try QuipslyNativeAccountKeychain.saveBrowserHandoff(pending)

            var components = URLComponents(
                url: base.appending(path: "/api/mac/session-handoff"),
                resolvingAgainstBaseURL: false
            )
            components?.queryItems = [
                URLQueryItem(name: "native", value: "1"),
                URLQueryItem(name: "callbackScheme", value: "quipslymac"),
                URLQueryItem(name: "state", value: state),
                URLQueryItem(name: "codeChallenge", value: codeChallenge),
                URLQueryItem(name: "deviceLabel", value: Host.current().localizedName ?? "Quipsly Studio for Mac"),
            ]
            guard let handoffURL = components?.url else {
                QuipslyNativeAccountKeychain.deleteBrowserHandoff()
                throw NSError(domain: "QuipslyNativeAccount", code: 12, userInfo: [
                    NSLocalizedDescriptionKey: "Quipsly Studio could not build the Nest sign-in URL.",
                ])
            }

            #if os(macOS)
            guard NSWorkspace.shared.open(handoffURL) else {
                QuipslyNativeAccountKeychain.deleteBrowserHandoff()
                throw NSError(domain: "QuipslyNativeAccount", code: 13, userInfo: [
                    NSLocalizedDescriptionKey: "macOS could not open the Nest sign-in page.",
                ])
            }
            #else
            QuipslyNativeAccountKeychain.deleteBrowserHandoff()
            throw NSError(domain: "QuipslyNativeAccount", code: 14, userInfo: [
                NSLocalizedDescriptionKey: "Browser handoff is currently available in Quipsly Studio for Mac.",
            ])
            #endif

            return "Finish Google sign-in in your browser. This Mac will verify the same Firebase identity automatically."
        }
    }

    @discardableResult
    func handleBrowserSignInCallback(_ url: URL) async -> String {
        await runAuthAction(start: "Verifying the browser return with Nest...") {
            defer { QuipslyNativeAccountKeychain.deleteBrowserHandoff() }

            guard let pending = QuipslyNativeAccountKeychain.loadBrowserHandoff() else {
                throw NSError(domain: "QuipslyNativeAccount", code: 15, userInfo: [
                    NSLocalizedDescriptionKey:
                        "No browser sign-in is pending on this Mac. Start again from Quipsly Studio.",
                ])
            }
            guard Date().timeIntervalSince(pending.createdAt) <= Self.browserHandoffLifetime else {
                throw NSError(domain: "QuipslyNativeAccount", code: 16, userInfo: [
                    NSLocalizedDescriptionKey:
                        "That browser sign-in attempt expired. Start again from Quipsly Studio.",
                ])
            }

            let handoff = try MacFirebaseBrowserHandoffParser.parse(url)
            guard handoff.state == pending.state else {
                throw NSError(domain: "QuipslyNativeAccount", code: 17, userInfo: [
                    NSLocalizedDescriptionKey:
                        "The browser return did not match the sign-in started by this Mac.",
                ])
            }
            guard let handoffBaseURL = URL(string: pending.baseURL) else {
                throw NSError(domain: "QuipslyNativeAccount", code: 18, userInfo: [
                    NSLocalizedDescriptionKey:
                        "The pending Nest origin is no longer valid. Start sign-in again.",
                ])
            }

            let exchange = try await exchangeBrowserHandoff(
                baseURL: handoffBaseURL,
                handoff: handoff,
                codeVerifier: pending.codeVerifier
            )
            let config = try await fetchFirebaseClientConfig(baseURL: handoffBaseURL)
            let signIn = try await signInWithCustomToken(
                config: config,
                customToken: exchange.customToken
            )
            try await verifyNativeSession(
                idToken: signIn.idToken,
                baseURL: handoffBaseURL
            )
            guard userEmail.caseInsensitiveCompare(exchange.user.email) == .orderedSame else {
                clearVerifiedIdentity()
                throw NSError(domain: "QuipslyNativeAccount", code: 19, userInfo: [
                    NSLocalizedDescriptionKey:
                        "Nest and Firebase returned different Quipsly users. Nothing was saved; start sign-in again.",
                ])
            }

            baseURL = handoffBaseURL.absoluteString
            email = userEmail
            try commitVerifiedFirebaseSession(
                idToken: signIn.idToken,
                refreshToken: signIn.refreshToken,
                expiresIn: signIn.expiresIn
            )
            return "Google sign-in verified for \(userEmail). Home Nest: \(homeNestSlug)."
        }
    }

    @discardableResult
    func checkSavedSession() async -> String {
        guard let refreshToken else {
            return setError("No saved native session yet. Sign in once with email/password.")
        }

        return await runAuthAction(start: "Refreshing Firebase token...") {
            let config = try await fetchFirebaseClientConfig()
            let refreshed = try await refreshFirebaseToken(config: config, refreshToken: refreshToken)
            try await verifyNativeSession(idToken: refreshed.id_token)
            try commitVerifiedFirebaseSession(
                idToken: refreshed.id_token,
                refreshToken: refreshed.refresh_token,
                expiresIn: refreshed.expires_in
            )
            return "Saved native session is valid for \(userEmail). Home Nest: \(homeNestSlug)."
        }
    }

    @discardableResult
    func fetchConfigOnly() async -> String {
        await runAuthAction(start: "Checking Firebase client config...") {
            let config = try await fetchFirebaseClientConfig()
            return "Firebase client config found for \(config.projectId)."
        }
    }

    func clearLocalSession() -> String {
        idToken = ""
        idTokenExpiresAt = .distantPast
        refreshToken = nil
        userEmail = ""
        userName = ""
        homeNestSlug = ""
        homeNestName = ""
        freeTierStatus = ""
        visibleProjects = []
        studioEvidenceHandoffs = []
        studioTranscriptCorrections = []
        isStaff = false
        lastVerifiedAt = nil
        errorMessage = ""
        statusMessage = "Local native session cleared. Firebase/Quipsly account was not deleted."
        QuipslyNativeAccountKeychain.deleteRefreshToken()
        QuipslyNativeAccountKeychain.deleteBrowserHandoff()
        return statusMessage
    }

    func authenticatedData(
        for request: URLRequest
    ) async throws -> (Data, HTTPURLResponse) {
        var authenticatedRequest = request
        var token = try await validIDToken()
        authenticatedRequest.setValue(
            "Bearer \(token)",
            forHTTPHeaderField: "authorization"
        )
        var (data, response) = try await URLSession.shared.data(
            for: authenticatedRequest
        )
        guard var http = response as? HTTPURLResponse else {
            throw NSError(
                domain: "QuipslyNativeAccount",
                code: 7,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Nest did not return an HTTP response.",
                ]
            )
        }

        if http.statusCode == 401 {
            token = try await refreshIDToken()
            authenticatedRequest.setValue(
                "Bearer \(token)",
                forHTTPHeaderField: "authorization"
            )
            (data, response) = try await URLSession.shared.data(
                for: authenticatedRequest
            )
            guard let retryHTTP = response as? HTTPURLResponse else {
                throw NSError(
                    domain: "QuipslyNativeAccount",
                    code: 8,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "Nest did not return an HTTP response after session refresh.",
                    ]
                )
            }
            http = retryHTTP
        }

        return (data, http)
    }

    private func runAuthAction(start: String, operation: () async throws -> String) async -> String {
        isBusy = true
        errorMessage = ""
        statusMessage = start
        defer { isBusy = false }

        do {
            let message = try await operation()
            statusMessage = message
            return message
        } catch {
            return setError(error.localizedDescription)
        }
    }

    private func setError(_ message: String) -> String {
        errorMessage = message
        statusMessage = "Native account needs attention."
        return message
    }

    private func commitFirebaseSession(
        idToken: String,
        refreshToken: String,
        expiresIn: String
    ) throws {
        try QuipslyNativeAccountKeychain.saveRefreshToken(refreshToken)
        self.idToken = idToken
        idTokenExpiresAt = Date().addingTimeInterval(
            TimeInterval(Int(expiresIn) ?? 3_600)
        )
        self.refreshToken = refreshToken
    }

    private func commitVerifiedFirebaseSession(
        idToken: String,
        refreshToken: String,
        expiresIn: String
    ) throws {
        do {
            try commitFirebaseSession(
                idToken: idToken,
                refreshToken: refreshToken,
                expiresIn: expiresIn
            )
        } catch {
            clearVerifiedIdentity()
            throw error
        }
    }

    private func clearVerifiedIdentity() {
        userEmail = ""
        userName = ""
        homeNestSlug = ""
        homeNestName = ""
        freeTierStatus = ""
        visibleProjects = []
        studioEvidenceHandoffs = []
        studioTranscriptCorrections = []
        isStaff = false
        lastVerifiedAt = nil
    }

    private func makeBrowserHandoffState() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: [
                NSLocalizedDescriptionKey:
                    "macOS could not generate a secure browser sign-in state.",
            ])
        }
        return Data(bytes)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func isLoopback(_ url: URL) -> Bool {
        guard url.scheme == "http" else { return false }
        switch url.host?.lowercased() {
        case "localhost", "127.0.0.1", "::1", "[::1]":
            return true
        default:
            return false
        }
    }

    private func validIDToken() async throws -> String {
        if !idToken.isEmpty,
           idTokenExpiresAt.timeIntervalSinceNow > 60 {
            return idToken
        }
        return try await refreshIDToken()
    }

    private func refreshIDToken() async throws -> String {
        guard let refreshToken else {
            throw NSError(
                domain: "QuipslyNativeAccount",
                code: 9,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Connect the native Quipsly account before joining an episode room.",
                ]
            )
        }
        let config = try await fetchFirebaseClientConfig()
        let refreshed = try await refreshFirebaseToken(
            config: config,
            refreshToken: refreshToken
        )
        idToken = refreshed.id_token
        idTokenExpiresAt = Date().addingTimeInterval(
            TimeInterval(Int(refreshed.expires_in) ?? 3_600)
        )
        self.refreshToken = refreshed.refresh_token
        try QuipslyNativeAccountKeychain.saveRefreshToken(
            refreshed.refresh_token
        )
        return refreshed.id_token
    }

    private func fetchFirebaseClientConfig() async throws -> FirebaseClientConfigEnvelope.FirebaseClientConfig {
        guard let baseURL = normalizedBaseURL else {
            throw NSError(domain: "QuipslyNativeAccount", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Nest base URL is not valid.",
            ])
        }
        return try await fetchFirebaseClientConfig(baseURL: baseURL)
    }

    private func fetchFirebaseClientConfig(
        baseURL: URL
    ) async throws -> FirebaseClientConfigEnvelope.FirebaseClientConfig {
        let url = baseURL.appending(path: "/api/mac/firebase-client-config")
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "QuipslyNativeAccount", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Nest did not return an HTTP response.",
            ])
        }

        let envelope = try JSONDecoder().decode(FirebaseClientConfigEnvelope.self, from: data)
        guard (200 ..< 300).contains(http.statusCode), envelope.ok, let firebase = envelope.firebase else {
            throw NSError(domain: "QuipslyNativeAccount", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: envelope.error ?? "Firebase client config is unavailable.",
            ])
        }
        return firebase
    }

    private func exchangeBrowserHandoff(
        baseURL: URL,
        handoff: MacFirebaseBrowserHandoff,
        codeVerifier: String
    ) async throws -> NativeBrowserExchange {
        var request = URLRequest(
            url: baseURL.appending(path: "/api/mac/session-exchange")
        )
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "code": handoff.code,
            "state": handoff.state,
            "codeVerifier": codeVerifier,
            "deviceLabel": Host.current().localizedName ?? "Quipsly Studio for Mac",
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "QuipslyNativeAccount", code: 20, userInfo: [
                NSLocalizedDescriptionKey:
                    "Nest did not return an HTTP response for the one-time sign-in.",
            ])
        }
        let envelope = try JSONDecoder().decode(
            NativeBrowserExchangeEnvelope.self,
            from: data
        )
        guard
            (200 ..< 300).contains(http.statusCode),
            envelope.ok,
            let customToken = envelope.customToken,
            !customToken.isEmpty,
            let exchangeUser = envelope.user
        else {
            throw NSError(domain: "QuipslyNativeAccount", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey:
                    envelope.error
                    ?? "Nest rejected the one-time Mac sign-in. Start again.",
            ])
        }
        return NativeBrowserExchange(
            customToken: customToken,
            user: exchangeUser
        )
    }

    private func signInWithCustomToken(
        config: FirebaseClientConfigEnvelope.FirebaseClientConfig,
        customToken: String
    ) async throws -> FirebaseCustomTokenSignInResponse {
        let url = URL(
            string:
                "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=\(config.apiKey)"
        )!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "token": customToken,
            "returnSecureToken": true,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "QuipslyNativeAccount", code: 21, userInfo: [
                NSLocalizedDescriptionKey:
                    "Firebase did not return an HTTP response for the Mac sign-in.",
            ])
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let firebaseCode = firebaseRESTErrorCode(from: data)
            let detail = firebaseCode.map { " (\($0))" } ?? ""
            throw NSError(domain: "QuipslyNativeAccount", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey:
                    "Firebase could not exchange the one-time Quipsly credential\(detail). Start sign-in again.",
            ])
        }
        return try JSONDecoder().decode(
            FirebaseCustomTokenSignInResponse.self,
            from: data
        )
    }

    private func firebaseRESTErrorCode(from data: Data) -> String? {
        guard
            let message = try? JSONDecoder()
                .decode(FirebaseRESTErrorEnvelope.self, from: data)
                .error?
                .message
        else {
            return nil
        }

        let code = message
            .split(separator: ":", maxSplits: 1)
            .first
            .map(String.init)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            let code,
            !code.isEmpty,
            code.count <= 80,
            code.allSatisfy({ $0.isUppercase || $0.isNumber || $0 == "_" || $0 == "-" })
        else {
            return nil
        }
        return code
    }

    private func signInWithPassword(
        config: FirebaseClientConfigEnvelope.FirebaseClientConfig
    ) async throws -> FirebasePasswordSignInResponse {
        let url = URL(string: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=\(config.apiKey)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines),
            "password": password,
            "returnSecureToken": true,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "QuipslyNativeAccount", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "Firebase did not return an HTTP response.",
            ])
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            throw NSError(domain: "QuipslyNativeAccount", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: "Firebase refused the email/password sign-in. Check the user exists and the password is correct.",
            ])
        }
        return try JSONDecoder().decode(FirebasePasswordSignInResponse.self, from: data)
    }

    private func refreshFirebaseToken(
        config: FirebaseClientConfigEnvelope.FirebaseClientConfig,
        refreshToken: String
    ) async throws -> FirebaseRefreshResponse {
        let url = URL(string: "https://securetoken.googleapis.com/v1/token?key=\(config.apiKey)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "content-type")
        request.httpBody = formURLEncoded([
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
        ]).data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "QuipslyNativeAccount", code: 4, userInfo: [
                NSLocalizedDescriptionKey: "Firebase refresh did not return an HTTP response.",
            ])
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            throw NSError(domain: "QuipslyNativeAccount", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: "Saved Firebase session could not be refreshed. Sign in again.",
            ])
        }
        return try JSONDecoder().decode(FirebaseRefreshResponse.self, from: data)
    }

    private func verifyNativeSession(
        idToken: String,
        baseURL explicitBaseURL: URL? = nil
    ) async throws {
        guard let baseURL = explicitBaseURL ?? normalizedBaseURL else {
            throw NSError(domain: "QuipslyNativeAccount", code: 5, userInfo: [
                NSLocalizedDescriptionKey: "Nest base URL is not valid.",
            ])
        }

        var request = URLRequest(
            url: baseURL.appending(path: "/api/mac/session-check")
        )
        request.setValue("Bearer \(idToken)", forHTTPHeaderField: "authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "QuipslyNativeAccount", code: 6, userInfo: [
                NSLocalizedDescriptionKey: "Nest did not return an HTTP response.",
            ])
        }

        let envelope = try JSONDecoder().decode(NativeSessionCheckEnvelope.self, from: data)
        guard (200 ..< 300).contains(http.statusCode), envelope.ok, envelope.authenticated else {
            throw NSError(domain: "QuipslyNativeAccount", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: envelope.error ?? "Nest rejected the Firebase session.",
            ])
        }

        userEmail = envelope.user?.email ?? ""
        userName = envelope.user?.name ?? ""
        homeNestSlug = envelope.homeNest?.slug ?? ""
        homeNestName = envelope.homeNest?.name ?? ""
        freeTierStatus = envelope.onboarding?.freeMembershipStatus ?? ""
        visibleProjects = envelope.projects ?? []
        studioEvidenceHandoffs = envelope.studioEvidenceHandoffs ?? []
        studioTranscriptCorrections = envelope.studioTranscriptCorrections ?? []
        isStaff = envelope.user?.isStaff ?? false
        lastVerifiedAt = Date()
    }

    private func formURLEncoded(_ fields: [String: String]) -> String {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        return fields
            .map { key, value in
                let encodedKey = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
                let encodedValue = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
                return "\(encodedKey)=\(encodedValue)"
            }
            .joined(separator: "&")
    }
}

struct QuipslyNativeAccountWorkbenchView: View {
    @ObservedObject var accountStore: QuipslyNativeAccountStore
    var onStatus: (String) -> Void
    @State private var showsPasswordRecovery = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                headerCard
                signInCard
                sessionTruthCard
                studioEvidenceCard
                transcriptCorrectionsCard
                projectsCard
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 18)
        }
        .accessibilityIdentifier("quipsly.workbench.account")
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "person.crop.circle.badge.checkmark")
                    .font(.title3)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                    .frame(width: 36, height: 36)
                    .background(QuipslyStudioTheme.creek.opacity(0.14))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text("Native Account")
                        .font(.headline)
                        .fontWeight(.black)
                    Text("One Google/Firebase identity across Nest, Capture, and Studio.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Text("The browser returns a five-minute, one-use code for the exact Firebase UID. No browser cookie or password is copied into the app.")
                .font(.caption2)
                .foregroundStyle(QuipslyStudioTheme.sage)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(QuipslyStudioTheme.panelLift.opacity(0.20))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var signInCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Connect this Mac", systemImage: "key.horizontal.fill")
                .font(.caption)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.honey)

            TextField("Nest base URL", text: $accountStore.baseURL)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("quipsly.account.baseURL")

            Text("Choose the same Google account you use for Nest. Quipsly Studio verifies the immutable Firebase identity before saving a device-local refresh token.")
                .font(.caption2)
                .foregroundStyle(QuipslyStudioTheme.sage)
                .fixedSize(horizontal: false, vertical: true)

            #if os(macOS)
            Button {
                Task {
                    let message = await accountStore.beginBrowserSignIn()
                    onStatus(message)
                }
            } label: {
                Label("Continue with Google", systemImage: "person.badge.key.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(accountStore.isBusy)
            .help("Open Nest in the browser, choose a Google account, and return a one-time Firebase handoff to this Mac.")
            .accessibilityIdentifier("quipsly.account.googleSignIn")
            #endif

            HStack(spacing: 8) {
                Button {
                    Task {
                        let message = await accountStore.checkSavedSession()
                        onStatus(message)
                    }
                } label: {
                    Label("Check saved connection", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(accountStore.isBusy || !accountStore.hasSavedSession)
                .help("Refresh the device-local Firebase session and verify Nest access.")

                Button(role: .destructive) {
                    let message = accountStore.clearLocalSession()
                    onStatus(message)
                } label: {
                    Label("Disconnect this Mac", systemImage: "rectangle.portrait.and.arrow.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(accountStore.isBusy && !accountStore.hasSavedSession)
            }

            DisclosureGroup(
                "Email/password recovery and diagnostics",
                isExpanded: $showsPasswordRecovery
            ) {
                VStack(alignment: .leading, spacing: 9) {
                    Text("Use this only if Google is unavailable or support asks you to diagnose Firebase. It resolves to the same Firebase identity boundary.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    TextField("Email", text: $accountStore.email)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.emailAddress)
                        .accessibilityIdentifier("quipsly.account.email")

                    SecureField("Firebase password", text: $accountStore.password)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("quipsly.account.password")

                    HStack(spacing: 8) {
                        Button {
                            Task {
                                let message = await accountStore.signInAndVerify()
                                onStatus(message)
                            }
                        } label: {
                            Label("Sign in with email", systemImage: "envelope.badge.shield.half.filled")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .disabled(accountStore.isBusy)

                        Button {
                            Task {
                                let message = await accountStore.fetchConfigOnly()
                                onStatus(message)
                            }
                        } label: {
                            Label("Check config", systemImage: "gearshape.2.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .disabled(accountStore.isBusy)
                    }
                }
            }
            .font(.caption)
        }
        .padding(12)
        .background(QuipslyStudioTheme.cardGradient)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var sessionTruthCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(
                    accountStore.isVerified ? "Verified" : "Needs check",
                    systemImage: accountStore.isVerified ? "checkmark.seal.fill" : "exclamationmark.triangle.fill"
                )
                .font(.caption)
                .fontWeight(.black)
                .foregroundStyle(accountStore.isVerified ? QuipslyStudioTheme.moss : QuipslyStudioTheme.honey)
                Spacer()
                if accountStore.isBusy {
                    ProgressView()
                        .controlSize(.small)
                }
            }

            Text(accountStore.statusMessage)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if !accountStore.errorMessage.isEmpty {
                Text(accountStore.errorMessage)
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.clay)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if accountStore.isVerified {
                VStack(alignment: .leading, spacing: 6) {
                    nativeAccountRow("User", accountStore.userEmail)
                    if !accountStore.userName.isEmpty {
                        nativeAccountRow("Name", accountStore.userName)
                    }
                    nativeAccountRow("Home Nest", accountStore.homeNestSlug)
                    if !accountStore.freeTierStatus.isEmpty {
                        nativeAccountRow("Free tier", accountStore.freeTierStatus.lowercased())
                    }
                    nativeAccountRow("Staff", accountStore.isStaff ? "yes" : "no")
                    if let verifiedAt = accountStore.lastVerifiedAt {
                        nativeAccountRow("Verified", verifiedAt.formatted(date: .omitted, time: .standard))
                    }
                }
            }
        }
        .padding(12)
        .background((accountStore.isVerified ? QuipslyStudioTheme.moss : QuipslyStudioTheme.honey).opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityIdentifier("quipsly.account.sessionTruth")
    }

    private var projectsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Visible Nests", systemImage: "square.stack.3d.up.fill")
                .font(.caption)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.lichen)

            if accountStore.visibleProjects.isEmpty {
                Text(accountStore.isVerified ? "No Nests returned yet. Home Nest should be visible; check backend onboarding if this persists." : "Verify the native session to load Home Nest and assigned Nests.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(accountStore.visibleProjects.prefix(8)) { project in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(project.name)
                                .font(.caption)
                                .fontWeight(.black)
                            Spacer()
                            Text(project.role.replacingOccurrences(of: "_", with: " ").lowercased())
                                .font(.caption2)
                                .fontWeight(.black)
                                .foregroundStyle(QuipslyStudioTheme.creekMist)
                        }
                        Text(project.slug)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .padding(9)
                    .background(QuipslyStudioTheme.panelLift.opacity(0.16))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
        }
        .padding(12)
        .background(QuipslyStudioTheme.cardGradient)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var studioEvidenceCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Nest evidence inbox", systemImage: "quote.bubble.fill")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                Spacer()
                Text("\(accountStore.studioEvidenceHandoffs.count)")
                    .font(.caption2)
                    .fontWeight(.black)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(QuipslyStudioTheme.creek.opacity(0.16))
                    .clipShape(Capsule())
            }

            if accountStore.studioEvidenceHandoffs.isEmpty {
                Text(accountStore.isVerified
                    ? "No source-pinned handoffs are waiting. Send a Nest-visible annotation from Research when it should shape the edit."
                    : "Verify the native session to read source-pinned handoffs from accessible Nests.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(accountStore.studioEvidenceHandoffs.prefix(12)) { handoff in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(handoff.sourceTitle)
                                    .font(.caption)
                                    .fontWeight(.black)
                                Text("\(handoff.projectName) · annotation r\(handoff.annotationRevision)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(handoff.annotationKind.replacingOccurrences(of: "_", with: " ").uppercased())
                                .font(.system(size: 9, weight: .black))
                                .foregroundStyle(QuipslyStudioTheme.honey)
                        }

                        Text("“\(handoff.exactText)”")
                            .font(.caption)
                            .italic()
                            .foregroundStyle(.primary)
                            .lineLimit(6)
                            .textSelection(.enabled)

                        if !handoff.annotationBody.isEmpty {
                            Text(handoff.annotationBody)
                                .font(.caption2)
                                .foregroundStyle(QuipslyStudioTheme.sage)
                                .lineLimit(5)
                                .textSelection(.enabled)
                        }

                        HStack(spacing: 6) {
                            Label("SHA \(String(handoff.sourceFingerprint.prefix(10)))", systemImage: "checkmark.shield.fill")
                            if handoff.humanReviewRequired {
                                Label("human review", systemImage: "eye.fill")
                            }
                            if handoff.privateWritingUseCount > 0 {
                                Label("\(handoff.privateWritingUseCount) private link hidden", systemImage: "lock.fill")
                            }
                        }
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(QuipslyStudioTheme.moss)

                        if !handoff.tags.isEmpty {
                            Text(handoff.tags.joined(separator: " · "))
                                .font(.system(size: 9, weight: .black))
                                .foregroundStyle(QuipslyStudioTheme.creekMist)
                        }
                    }
                    .padding(10)
                    .background(QuipslyStudioTheme.panelLift.opacity(0.18))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(QuipslyStudioTheme.creek.opacity(0.24), lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("quipsly.account.studioEvidence.\(handoff.id)")
                }
            }

            Text("Read-only brief. Opening it here never changes source media, publishes work, or exposes private draft contents.")
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(QuipslyStudioTheme.cardGradient)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityIdentifier("quipsly.account.studioEvidenceInbox")
    }

    private var transcriptCorrectionsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Transcript review inbox", systemImage: "waveform.badge.magnifyingglass")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                Spacer()
                Text("\(accountStore.studioTranscriptCorrections.count)")
                    .font(.caption2)
                    .fontWeight(.black)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(QuipslyStudioTheme.honey.opacity(0.16))
                    .clipShape(Capsule())
            }

            Text("Read-only correction context from Nest. Proposed AI changes are never treated as transcript truth; accept or reject them against protected playback in the session review desk.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if accountStore.studioTranscriptCorrections.isEmpty {
                Text(accountStore.isVerified
                    ? "No accepted corrections or review proposals are available from accessible sessions."
                    : "Verify the native session to read playback-reviewed transcript corrections.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(accountStore.studioTranscriptCorrections.prefix(16)) { correction in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(correction.roomTitle)
                                    .font(.caption)
                                    .fontWeight(.black)
                                    .lineLimit(2)
                                Text("\(nativeTranscriptTime(correction.startSeconds))–\(nativeTranscriptTime(correction.endSeconds)) · \(correction.correctedSpeakerLabel ?? correction.effectiveSpeakerLabel ?? "Unlabelled speaker")")
                                    .font(.caption2)
                                    .fontWeight(.bold)
                                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                            }
                            Spacer()
                            Text(correction.status.replacingOccurrences(of: "_", with: " ").lowercased())
                                .font(.caption2)
                                .fontWeight(.black)
                                .foregroundStyle(correction.humanReviewRequired ? QuipslyStudioTheme.honey : QuipslyStudioTheme.moss)
                        }

                        if correction.humanReviewRequired {
                            Label("AI proposal — human playback review required", systemImage: "person.crop.circle.badge.exclamationmark")
                                .font(.caption2)
                                .fontWeight(.black)
                                .foregroundStyle(QuipslyStudioTheme.honey)
                        } else {
                            Label("Accepted reviewed overlay · \(correction.revisionCount) revision(s)", systemImage: "checkmark.shield.fill")
                                .font(.caption2)
                                .fontWeight(.black)
                                .foregroundStyle(QuipslyStudioTheme.moss)
                        }

                        Text(correction.correctedText ?? correction.effectiveText)
                            .font(.caption)
                            .foregroundStyle(.primary)
                            .fixedSize(horizontal: false, vertical: true)

                        DisclosureGroup("Provider evidence") {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(correction.providerSpeakerLabel ?? "Unlabelled provider speaker")
                                    .font(.caption2)
                                    .fontWeight(.black)
                                Text(correction.providerText)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.top, 4)
                        }
                        .font(.caption2)

                        if let reason = correction.reason, !reason.isEmpty {
                            Text("Reason: \(reason)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Button {
                            if let base = accountStore.normalizedBaseURL {
                                openURL(base.appending(path: "/sessions/\(correction.roomId)"))
                            }
                        } label: {
                            Label(correction.humanReviewRequired ? "Review against playback in Nest" : "Open correction evidence in Nest", systemImage: "arrow.up.right.square")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .disabled(!accountStore.isVerified)
                    }
                    .padding(10)
                    .background((correction.humanReviewRequired ? QuipslyStudioTheme.honey : QuipslyStudioTheme.moss).opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
        }
        .padding(12)
        .background(QuipslyStudioTheme.cardGradient)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityIdentifier("quipsly.account.transcriptCorrections")
    }

    private func nativeTranscriptTime(_ seconds: Double) -> String {
        let safeSeconds = max(0, Int(seconds.rounded(.down)))
        return String(format: "%d:%02d", safeSeconds / 60, safeSeconds % 60)
    }

    private func nativeAccountRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.sage)
                .frame(width: 72, alignment: .leading)
            Text(value)
                .font(.caption2)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
            Spacer(minLength: 4)
        }
    }
}
