import Foundation
#if !DEBUG
import Security
#endif

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
    #if !DEBUG
    private static let service = "com.quipsly.mac.nest-session"
    #endif
    private static let account = "default-access-token"
    private static let legacyDefaultAccount = "default"
    private static let legacyDefaultsKey = "quipslyMac.nestSessionToken"
    private static let profilesDefaultsKey = "quipslyMac.nestSessionProfiles"
    private static let activeProfileDefaultsKey = "quipslyMac.activeNestSessionProfileEmail"
    private static let fileVaultName = "nest-session-vault.json"

    static func load() -> String {
        guard
            let activeEmail = activeProfileEmail(),
            let profileToken = readVaultToken(account: accessAccount(activeEmail)),
            !profileToken.isEmpty
        else {
            return ""
        }

        return profileToken
    }

    static func save(_ token: String) {
        let trimmedToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            !trimmedToken.isEmpty,
            let activeEmail = activeProfileEmail()
        else {
            return
        }

        writeVaultToken(trimmedToken, account: accessAccount(activeEmail))

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
        writeVaultToken(trimmedAccessToken, account: accessAccount(normalizedEmail))
        writeVaultToken(trimmedRefreshToken, account: refreshAccount(normalizedEmail))
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
        return readVaultToken(account: refreshAccount(normalizedEmail))
    }

    @discardableResult
    static func switchActiveProfile(email: String) -> (profile: NestSessionProfile, token: String)? {
        let normalizedEmail = normalizeEmail(email)
        guard let profile = profiles().first(where: { $0.email == normalizedEmail }) else {
            return nil
        }

        setActiveProfileEmail(normalizedEmail)
        let token = readVaultToken(account: accessAccount(normalizedEmail)) ?? ""
        return (profile, token)
    }

    static func removeProfile(email: String) {
        let normalizedEmail = normalizeEmail(email)
        guard !normalizedEmail.isEmpty else { return }

        deleteVaultToken(account: accessAccount(normalizedEmail))
        deleteVaultToken(account: refreshAccount(normalizedEmail))
        deleteVaultToken(account: legacyProfileAccount(normalizedEmail))
        saveProfiles(profiles().filter { $0.email != normalizedEmail })

        if activeProfileEmail() == normalizedEmail {
            UserDefaults.standard.removeObject(forKey: activeProfileDefaultsKey)
            if let next = profiles().first {
                _ = switchActiveProfile(email: next.email)
            } else {
                deleteVaultToken(account: account)
            }
        }
    }

    static func clearActiveProfile() {
        UserDefaults.standard.removeObject(forKey: activeProfileDefaultsKey)
        deleteVaultToken(account: account)
        UserDefaults.standard.removeObject(forKey: legacyDefaultsKey)
    }

    static func clearAllProfiles() {
        for profile in profiles() {
            deleteVaultToken(account: accessAccount(profile.email))
            deleteVaultToken(account: refreshAccount(profile.email))
            deleteVaultToken(account: legacyProfileAccount(profile.email))
        }

        deleteVaultToken(account: account)
        deleteVaultToken(account: legacyDefaultAccount)
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

    private static func writeVaultToken(_ token: String, account: String) {
        #if DEBUG
        var vault = readFileTokenVault()
        vault[account] = token
        writeFileTokenVault(vault)
        #else
        writeSystemKeychainToken(token, account: account)
        #endif
    }

    private static func deleteVaultToken(account: String) {
        #if DEBUG
        var vault = readFileTokenVault()
        vault.removeValue(forKey: account)
        writeFileTokenVault(vault)
        #else
        deleteSystemKeychainToken(account: account)
        #endif
    }

    private static func readVaultToken(account: String) -> String? {
        #if DEBUG
        return readFileTokenVault()[account]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        #else
        return readSystemKeychainToken(account: account)
        #endif
    }

    private static func readFileTokenVault() -> [String: String] {
        guard
            let url = fileTokenVaultURL(),
            let data = try? Data(contentsOf: url),
            let vault = try? JSONDecoder().decode([String: String].self, from: data)
        else {
            return [:]
        }

        return vault
    }

    private static func writeFileTokenVault(_ vault: [String: String]) {
        guard let url = fileTokenVaultURL(createDirectory: true) else { return }

        do {
            let data = try JSONEncoder().encode(vault)
            try data.write(to: url, options: [.atomic])
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o600],
                ofItemAtPath: url.path
            )
        } catch {
            // Keep native UI calm. API calls will report auth-required if the
            // local vault cannot be written.
        }
    }

    private static func fileTokenVaultURL(createDirectory: Bool = false) -> URL? {
        do {
            let base = try FileManager.default.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: createDirectory
            )
            let directory = base.appendingPathComponent("QuipslyMac", isDirectory: true)
            if createDirectory {
                try FileManager.default.createDirectory(
                    at: directory,
                    withIntermediateDirectories: true
                )
                try FileManager.default.setAttributes(
                    [.posixPermissions: 0o700],
                    ofItemAtPath: directory.path
                )
            }
            return directory.appendingPathComponent(fileVaultName)
        } catch {
            return nil
        }
    }

    #if !DEBUG
    private static func writeSystemKeychainToken(_ token: String, account: String) {
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

    private static func deleteSystemKeychainToken(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    private static func readSystemKeychainToken(account: String) -> String? {
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
    #endif
}
