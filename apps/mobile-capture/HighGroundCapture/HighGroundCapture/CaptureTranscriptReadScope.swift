import Foundation

/// A response belongs to one opening of one transcript, not just its room ID.
/// Reopening the same room or switching accounts invalidates older responses.
struct CaptureTranscriptReadScope: Equatable {
    let roomID: String
    let recordingAssetID: String?
    let transcriptJobID: String?
    let ownerAccountID: String?
    let requestID = UUID()

    func permitsDisplay(active: CaptureTranscriptReadScope?, currentOwnerAccountID: String?) -> Bool {
        self == active && ProtectedProjectionCacheIdentity.permitsRestore(
            cacheSchemaVersion: ProtectedProjectionCacheIdentity.schemaVersion,
            cachedOwnerAccountID: ownerAccountID,
            activeOwnerAccountID: currentOwnerAccountID
        )
    }
}
