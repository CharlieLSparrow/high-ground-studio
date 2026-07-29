import Foundation
import Security
import SwiftUI

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

    static func saveRefreshToken(_ refreshToken: String) throws {
        guard let data = refreshToken.data(using: .utf8) else { return }
        deleteRefreshToken()

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: refreshTokenAccount,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: [
                NSLocalizedDescriptionKey: "Keychain refused to save the native refresh token.",
            ])
        }
    }

    static func loadRefreshToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: refreshTokenAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func deleteRefreshToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: refreshTokenAccount,
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
    private var idToken: String = ""
    private var refreshToken: String?

    init() {
        baseURL = UserDefaults.standard.string(forKey: Self.baseURLKey) ?? "https://nest.quipsly.com"
        email = UserDefaults.standard.string(forKey: Self.emailKey) ?? ""
        refreshToken = QuipslyNativeAccountKeychain.loadRefreshToken()
        if refreshToken != nil {
            statusMessage = "Saved native refresh token found. Check session to verify it with Nest."
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
            "truth": "Native Mac API calls use Firebase bearer tokens and saved Keychain refresh tokens. Browser Google login remains a separate user-facing check, converging by email in Quipsly."
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
            idToken = signIn.idToken
            refreshToken = signIn.refreshToken
            try QuipslyNativeAccountKeychain.saveRefreshToken(signIn.refreshToken)
            password = ""
            try await verifyNativeSession(idToken: signIn.idToken)
            return "Native session verified for \(userEmail). Home Nest: \(homeNestSlug)."
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
            idToken = refreshed.id_token
            self.refreshToken = refreshed.refresh_token
            try QuipslyNativeAccountKeychain.saveRefreshToken(refreshed.refresh_token)
            try await verifyNativeSession(idToken: refreshed.id_token)
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
        return statusMessage
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

    private func fetchFirebaseClientConfig() async throws -> FirebaseClientConfigEnvelope.FirebaseClientConfig {
        guard let base = normalizedBaseURL else {
            throw NSError(domain: "QuipslyNativeAccount", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Nest base URL is not valid.",
            ])
        }

        let url = base.appending(path: "/api/mac/firebase-client-config")
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

    private func verifyNativeSession(idToken: String) async throws {
        guard let base = normalizedBaseURL else {
            throw NSError(domain: "QuipslyNativeAccount", code: 5, userInfo: [
                NSLocalizedDescriptionKey: "Nest base URL is not valid.",
            ])
        }

        var request = URLRequest(url: base.appending(path: "/api/mac/session-check"))
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
                    Text("Firebase proves identity. Nest confirms Home Nest and project access.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Text("This is the boring permanent path: no manual cookies, no hidden WebView session guessing, no Patreon-as-login contortions.")
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

            Text("Native API calls currently use Firebase email/password plus a Keychain refresh token. Use the browser login button for the Google account chooser; both paths should converge into the same Quipsly user by email.")
                .font(.caption2)
                .foregroundStyle(QuipslyStudioTheme.sage)
                .fixedSize(horizontal: false, vertical: true)

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
                    Label("Sign in + verify", systemImage: "checkmark.shield.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(accountStore.isBusy)
                .help("Sign in with Firebase email/password, store the refresh token in Keychain, then verify Nest access.")

                Button {
                    Task {
                        let message = await accountStore.checkSavedSession()
                        onStatus(message)
                    }
                } label: {
                    Label("Check saved", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(accountStore.isBusy || !accountStore.hasSavedSession)
                .help("Refresh the saved Firebase session and call /api/mac/session-check.")
            }

            HStack(spacing: 8) {
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

                Button(role: .destructive) {
                    let message = accountStore.clearLocalSession()
                    onStatus(message)
                } label: {
                    Label("Clear local", systemImage: "trash")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(accountStore.isBusy && !accountStore.hasSavedSession)
            }

            Button {
                if let base = accountStore.normalizedBaseURL {
                    openURL(base.appending(path: "/login"))
                }
            } label: {
                Label("Open Nest login in browser", systemImage: "safari")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .help("Use this for Google/browser login checks. Native API calls still use Firebase bearer tokens.")
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
