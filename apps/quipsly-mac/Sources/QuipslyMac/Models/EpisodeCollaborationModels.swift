import Foundation

struct EpisodeCollaborationState: Decodable {
    var ok: Bool
    var projectSlug: String
    var episodeSlug: String
    var productionId: String?
    var title: String?
    var role: String?
    var updatedAt: String?
    var timelineFingerprint: String?
    var timelineClipCount: Int?
    var activeCollaborators: [EpisodeCollaborator]
    var editLease: EpisodeEditLease?
    var assetManifest: EpisodeAssetManifest?
    var recommendedPollSeconds: Int?
    var guidance: EpisodeCollaborationGuidance?
    var error: String?

    static let empty = EpisodeCollaborationState(
        ok: false,
        projectSlug: "",
        episodeSlug: "",
        productionId: nil,
        title: nil,
        role: nil,
        updatedAt: nil,
        timelineFingerprint: nil,
        timelineClipCount: nil,
        activeCollaborators: [],
        editLease: nil,
        assetManifest: nil,
        recommendedPollSeconds: nil,
        guidance: nil,
        error: nil
    )
}

struct EpisodeCollaborator: Decodable, Identifiable {
    var email: String
    var name: String
    var app: String
    var route: String
    var editing: Bool
    var lastSeenAt: String

    var id: String { "\(email)-\(app)-\(route)" }
}

struct EpisodeEditLease: Decodable {
    var email: String
    var name: String
    var acquiredAt: String
    var expiresAt: String
    var app: String
}

struct EpisodeAssetManifest: Decodable {
    var totalAssets: Int
    var timelineClipCount: Int
    var assets: [EpisodeCollaborationAsset]
}

struct EpisodeCollaborationAsset: Decodable, Identifiable {
    var assetId: String
    var clipId: String?
    var name: String
    var kind: String
    var role: String?
    var sourceUrl: String?
    var playbackUrl: String?
    var gcsUri: String?
    var durationSeconds: Double?
    var trackId: String?
    var status: String

    var id: String { "\(assetId)-\(clipId ?? "asset")" }
    var bestURL: String? { sourceUrl ?? playbackUrl }
}

struct EpisodeCollaborationGuidance: Decodable {
    var editSync: String?
    var assets: String?
    var conflicts: String?
}

struct EpisodeLocalAssetAvailability {
    enum Status: String {
        case cached
        case missing
        case sourceUnavailable
        case needsRelink
        case error
    }

    var status: Status
    var label: String
    var detail: String
    var folderPath: String?
    var filePath: String?
    var fileSizeBytes: Int64?
}
