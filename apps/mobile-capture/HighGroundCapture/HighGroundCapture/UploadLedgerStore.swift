import Foundation
import Security

/// Durable storage for background capture jobs.
///
/// The non-secret ledger is an atomically replaced, protected Application
/// Support file. Secret GCS resumable capability URLs are stored separately in
/// the device-only Keychain so they never land in preferences, logs, or backup.
enum UploadLedgerStore {
    enum LoadResult {
        case data(Data)
        case missing
        case unavailable(Error)
    }

    private static let directoryName = "QuipslyCapture/Uploads"
    private static let ledgerFileName = "active-uploads-v2.json"
    private static let capabilityService = "com.highgroundodyssey.HighGroundCapture.gcs-resumable-capability"

    static func loadLedger() -> LoadResult {
        do {
            let url = try ledgerURL(createDirectory: false)
            guard FileManager.default.fileExists(atPath: url.path) else { return .missing }
            return .data(try Data(contentsOf: url, options: [.mappedIfSafe]))
        } catch {
            return .unavailable(error)
        }
    }

    static func saveLedger(_ data: Data) throws {
        let url = try ledgerURL(createDirectory: true)
        try data.write(to: url, options: .atomic)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: url.path
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableURL = url
        try mutableURL.setResourceValues(values)
    }

    static func loadCapability(for sessionID: String) -> String? {
        var query = capabilityQuery(for: sessionID)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8),
              !value.isEmpty else { return nil }
        return value
    }

    static func saveCapability(_ value: String, for sessionID: String) throws {
        guard let data = value.data(using: .utf8), !data.isEmpty else {
            throw StoreError.invalidCapability
        }

        let query = capabilityQuery(for: sessionID)
        let attributes: [String: Any] = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw StoreError.keychain(updateStatus)
        }

        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(add as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw StoreError.keychain(addStatus) }
    }

    static func deleteCapability(for sessionID: String) {
        SecItemDelete(capabilityQuery(for: sessionID) as CFDictionary)
    }

    private static func ledgerURL(createDirectory: Bool) throws -> URL {
        guard let applicationSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            throw StoreError.applicationSupportUnavailable
        }
        let directory = applicationSupport.appendingPathComponent(directoryName, isDirectory: true)
        if createDirectory {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
            )
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutableDirectory = directory
            try mutableDirectory.setResourceValues(values)
        }
        return directory.appendingPathComponent(ledgerFileName, isDirectory: false)
    }

    private static func capabilityQuery(for sessionID: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: capabilityService,
            kSecAttrAccount as String: sessionID.lowercased(),
        ]
    }

    private enum StoreError: LocalizedError {
        case applicationSupportUnavailable
        case invalidCapability
        case keychain(OSStatus)

        var errorDescription: String? {
            switch self {
            case .applicationSupportUnavailable:
                return "Application Support is unavailable."
            case .invalidCapability:
                return "The upload capability is empty."
            case .keychain(let status):
                return SecCopyErrorMessageString(status, nil) as String?
                    ?? "Keychain returned status \(status)."
            }
        }
    }
}
