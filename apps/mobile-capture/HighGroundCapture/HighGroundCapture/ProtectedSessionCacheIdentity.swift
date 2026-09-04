import Foundation

/// Fail-closed identity policy for recoverable server projections.
/// Email is mutable display/contact data; only Nest's immutable actor ID may
/// authorize restoring protected tenant data into the signed-in product shell.
enum ProtectedProjectionCacheIdentity {
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

/// Compatibility spelling retained for the Session projection and its focused
/// release harness. All protected server projections now share the same actor
/// identity contract rather than independently trusting mutable email aliases.
enum ProtectedSessionCacheIdentity {
    static let schemaVersion = ProtectedProjectionCacheIdentity.schemaVersion

    static func permitsRestore(
        cacheSchemaVersion: Int,
        cachedOwnerAccountID: String?,
        activeOwnerAccountID: String?
    ) -> Bool {
        ProtectedProjectionCacheIdentity.permitsRestore(
            cacheSchemaVersion: cacheSchemaVersion,
            cachedOwnerAccountID: cachedOwnerAccountID,
            activeOwnerAccountID: activeOwnerAccountID
        )
    }
}
