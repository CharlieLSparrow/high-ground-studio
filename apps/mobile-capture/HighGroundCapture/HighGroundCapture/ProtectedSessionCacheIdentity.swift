import Foundation

/// Fail-closed identity policy for the recoverable Session projection.
/// Email is mutable display/contact data; only Nest's immutable actor ID may
/// authorize restoring a protected cache into the signed-in product shell.
enum ProtectedSessionCacheIdentity {
    static let schemaVersion = 3

    static func permitsRestore(
        cacheSchemaVersion: Int,
        cachedOwnerAccountID: String?,
        activeOwnerAccountID: String?
    ) -> Bool {
        guard cacheSchemaVersion == schemaVersion,
              let cachedOwner = normalized(cachedOwnerAccountID),
              let activeOwner = normalized(activeOwnerAccountID) else {
            return false
        }
        return cachedOwner == activeOwner
    }

    private static func normalized(_ value: String?) -> String? {
        guard let value = value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty,
              value.count <= 256 else {
            return nil
        }
        return value
    }
}
