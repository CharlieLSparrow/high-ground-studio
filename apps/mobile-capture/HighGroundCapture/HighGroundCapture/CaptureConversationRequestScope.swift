import Foundation

/// Network work belongs to an account and one opening of a conversation.
/// A read also belongs to the revision before any subsequent local save.
struct CaptureConversationRequestScope: Equatable {
    let contextKey: String
    let ownerAccountID: String?
    let openingID: UUID
    let readRevision: Int

    func belongsToOpening(_ active: Self?, currentOwnerAccountID: String?) -> Bool {
        guard let active else { return false }
        return contextKey == active.contextKey && openingID == active.openingID
            && ownerAccountID == active.ownerAccountID
            && ProtectedProjectionCacheIdentity.permitsRestore(
                cacheSchemaVersion: ProtectedProjectionCacheIdentity.schemaVersion,
                cachedOwnerAccountID: ownerAccountID, activeOwnerAccountID: currentOwnerAccountID)
    }

    func permitsDisplay(_ active: Self?, currentOwnerAccountID: String?) -> Bool {
        self == active && belongsToOpening(active, currentOwnerAccountID: currentOwnerAccountID)
    }
}
