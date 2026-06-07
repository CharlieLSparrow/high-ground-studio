import Foundation
import Security

struct NestSessionProfile: Codable, Hashable, Identifiable {
    var id: String { email }

    var email: String
    var name: String
    var expiresAt: String
    var savedAt: String
    var lastVerifiedAt: String
    var refreshTokenExpiresAt: String?
    var deviceSessionId: String?

    var accessTokenExpiresAt: String { expiresAt }
}

enum NestSessionTokenStore {
    private static let service = "com.quipsly.mac.nest-session"
    private static let account = "default-access-token"
    private static let legacyDefaultAccount = "default"
    private static let legacyDefaultsKey = "quipslyMac.nestSessionToken"
    private static let profilesDefaultsKey = "quipslyMac.nestSessionProfiles"
    private static let activeProfileDefaultsKey = "quipslyMac.activeNestSessionProfileEmail"

    static func load() -> String {
        if
            let activeEmail = activeProfileEmail(),
            let profileToken = readKeychainToken(account: accessAccount(activeEmail)),
            !profileToken.isEmpty
        {
            writeKeychainToken(profileToken, account: account)
            return profileToken
        }

        if let token = readKeychainToken(account: account), !token.isEmpty {
            return token
        }

        if let legacyToken = readKeychainToken(account: legacyDefaultAccount), !legacyToken.isEmpty {
            writeKeychainToken(legacyToken, account: account)
            deleteKeychainToken(account: legacyDefaultAccount)
            return legacyToken
        }

        let legacyToken = UserDefaults.standard.string(forKey: legacyDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !legacyToken.isEmpty {
            save(legacyToken)
            return legacyToken
        }

        return ""
    }

    static func save(_ token: String) {
        let trimmedToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedToken.isEmpty else {
            deleteKeychainToken(account: account)
            return
        }

        writeKeychainToken(trimmedToken, account: account)

        if let activeEmail = activeProfileEmail() {
            writeKeychainToken(trimmedToken, account: accessAccount(activeEmail))
        }

        UserDefaults.standard.removeObject(forKey: legacyDefaultsKey)
    }

    @discardableResult
    static func saveProfile(
        credentials: NestSessionCredentials,
        verifiedAt: Date = Date()
    ) -> NestSessionProfile? {
        saveProfile(
            accessToken: credentials.accessToken,
            refreshToken: credentials.refreshToken,
            email: credentials.user.primaryEmail.isEmpty ? credentials.user.email : credentials.user.primaryEmail,
            name: credentials.user.name,
            accessTokenExpiresAt: credentials.accessTokenExpiresAt,
            refreshTokenExpiresAt: credentials.refreshTokenExpiresAt,
            deviceSessionId: credentials.deviceSessionId,
            verifiedAt: verifiedAt
        )
    }

    @discardableResult
    static func saveProfile(
        accessToken: String,
        refreshToken: String,
        email: String,
        name: String?,
        accessTokenExpiresAt: String?,
        refreshTokenExpiresAt: String?,
        deviceSessionId: String?,
        verifiedAt: Date = Date()
    ) -> NestSessionProfile? {
        let normalizedEmail = normalizeEmail(email)
        let trimmedAccessToken = accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedRefreshToken = refreshToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty, !trimmedAccessToken.isEmpty, !trimmedRefreshToken.isEmpty else {
            return nil
        }

        let timestamp = isoDate(verifiedAt)
        var profile = NestSessionProfile(
            email: normalizedEmail,
            name: name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            expiresAt: accessTokenExpiresAt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            savedAt: timestamp,
            lastVerifiedAt: timestamp,
            refreshTokenExpiresAt: refreshTokenExpiresAt?.trimmingCharacters(in: .whitespacesAndNewlines),
            deviceSessionId: deviceSessionId?.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        let existingProfiles = profiles()
        var nextProfiles = existingProfiles.filter { $0.email != normalizedEmail }
        if let existing = existingProfiles.first(where: { $0.email == normalizedEmail }) {
            profile.savedAt = existing.savedAt.isEmpty ? timestamp : existing.savedAt
            if profile.name.isEmpty {
                profile.name = existing.name
            }
        }

        nextProfiles.insert(profile, at: 0)
        saveProfiles(nextProfiles)
        setActiveProfileEmail(normalizedEmail)
        writeKeychainToken(trimmedAccessToken, account: accessAccount(normalizedEmail))
        writeKeychainToken(trimmedRefreshToken, account: refreshAccount(normalizedEmail))
        writeKeychainToken(trimmedAccessToken, account: account)
        UserDefaults.standard.removeObject(forKey: legacyDefaultsKey)
        return profile
    }

    static func recordVerification(email: String, name: String?, verifiedAt: Date = Date()) {
        let normalizedEmail = normalizeEmail(email)
        guard !normalizedEmail.isEmpty else { return }

        let timestamp = isoDate(verifiedAt)
        let nextProfiles = profiles().map { profile -> NestSessionProfile in
            guard profile.email == normalizedEmail else { return profile }
            var next = profile
            if let name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                next.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            next.lastVerifiedAt = timestamp
            return next
        }
        saveProfiles(nextProfiles)
    }

    static func profiles() -> [NestSessionProfile] {
        guard
            let data = UserDefaults.standard.data(forKey: profilesDefaultsKey),
            let decoded = try? JSONDecoder().decode([NestSessionProfile].self, from: data)
        else {
            return []
        }

        return decoded
            .filter { !$0.email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .sorted { lhs, rhs in
                lhs.lastVerifiedAt > rhs.lastVerifiedAt
            }
    }

    static func activeProfileEmail() -> String? {
        let email = normalizeEmail(UserDefaults.standard.string(forKey: activeProfileDefaultsKey) ?? "")
        return email.isEmpty ? nil : email
    }

    static func activeProfile() -> NestSessionProfile? {
        guard let email = activeProfileEmail() else { return nil }
        return profiles().first(where: { $0.email == email })
    }

    static func activeRefreshToken() -> String? {
        guard let email = activeProfileEmail() else { return nil }
        return refreshToken(for: email)
    }

    static func refreshToken(for email: String) -> String? {
        let normalizedEmail = normalizeEmail(email)
        guard !normalizedEmail.isEmpty else { return nil }
        return readKeychainToken(account: refreshAccount(normalizedEmail))
    }

    @discardableResult
    static func switchActiveProfile(email: String) -> (profile: NestSessionProfile, token: String)? {
        let normalizedEmail = normalizeEmail(email)
        guard let profile = profiles().first(where: { $0.email == normalizedEmail }) else {
            return nil
        }

        setActiveProfileEmail(normalizedEmail)
        let token = readKeychainToken(account: accessAccount(normalizedEmail)) ?? ""
        if !token.isEmpty {
            writeKeychainToken(token, account: account)
        } else {
            deleteKeychainToken(account: account)
        }
        return (profile, token)
    }

    static func removeProfile(email: String) {
        let normalizedEmail = normalizeEmail(email)
        guard !normalizedEmail.isEmpty else { return }

        deleteKeychainToken(account: accessAccount(normalizedEmail))
        deleteKeychainToken(account: refreshAccount(normalizedEmail))
        deleteKeychainToken(account: legacyProfileAccount(normalizedEmail))
        saveProfiles(profiles().filter { $0.email != normalizedEmail })

        if activeProfileEmail() == normalizedEmail {
            UserDefaults.standard.removeObject(forKey: activeProfileDefaultsKey)
            if let next = profiles().first {
                _ = switchActiveProfile(email: next.email)
            } else {
                deleteKeychainToken(account: account)
            }
        }
    }

    static func clearActiveProfile() {
        UserDefaults.standard.removeObject(forKey: activeProfileDefaultsKey)
        deleteKeychainToken(account: account)
        UserDefaults.standard.removeObject(forKey: legacyDefaultsKey)
    }

    static func clearAllProfiles() {
        for profile in profiles() {
            deleteKeychainToken(account: accessAccount(profile.email))
            deleteKeychainToken(account: refreshAccount(profile.email))
            deleteKeychainToken(account: legacyProfileAccount(profile.email))
        }

        deleteKeychainToken(account: account)
        deleteKeychainToken(account: legacyDefaultAccount)
        UserDefaults.standard.removeObject(forKey: profilesDefaultsKey)
        UserDefaults.standard.removeObject(forKey: activeProfileDefaultsKey)
        UserDefaults.standard.removeObject(forKey: legacyDefaultsKey)
    }

    static func accessTokenLooksFresh(_ profile: NestSessionProfile?, skewSeconds: TimeInterval = 120) -> Bool {
        guard
            let profile,
            let expiresAt = isoParser.date(from: profile.accessTokenExpiresAt),
            !load().isEmpty
        else {
            return false
        }

        return expiresAt.timeIntervalSinceNow > skewSeconds
    }

    private static func saveProfiles(_ profiles: [NestSessionProfile]) {
        if let data = try? JSONEncoder().encode(profiles) {
            UserDefaults.standard.set(data, forKey: profilesDefaultsKey)
        }
    }

    private static func setActiveProfileEmail(_ email: String) {
        let normalizedEmail = normalizeEmail(email)
        if normalizedEmail.isEmpty {
            UserDefaults.standard.removeObject(forKey: activeProfileDefaultsKey)
        } else {
            UserDefaults.standard.set(normalizedEmail, forKey: activeProfileDefaultsKey)
        }
    }

    private static func accessAccount(_ email: String) -> String {
        "access:\(normalizeEmail(email))"
    }

    private static func refreshAccount(_ email: String) -> String {
        "refresh:\(normalizeEmail(email))"
    }

    private static func legacyProfileAccount(_ email: String) -> String {
        "profile:\(normalizeEmail(email))"
    }

    private static func normalizeEmail(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func isoDate(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }

    private static var isoParser: ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }

    private static func writeKeychainToken(_ token: String, account: String) {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]

        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var addQuery = query
            addQuery.merge(attributes) { _, new in new }
            SecItemAdd(addQuery as CFDictionary, nil)
        }
    }

    private static func deleteKeychainToken(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    private static func readKeychainToken(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            return nil
        }

        return String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
