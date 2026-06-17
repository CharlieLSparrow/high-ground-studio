import Foundation

public enum PremierePacketImportError: Error {
    case missingEditGraph
}

public struct PremierePacketImporter {
    public static func importProject(from url: URL) throws -> VideoProject {
        let data = try Data(contentsOf: url)
        let packet = try JSONDecoder().decode(PremiereRescuePacket.self, from: data)
        let graph = packet.quipslyEditGraph

        var lanes: [VideoLane] = graph.sources.map { source in
            let offset = deriveOffset(for: source, graph: graph)
            let mediaURL = source.resolvedURL
            let semantic = laneSemantic(for: source)
            let sourceVideo = SourceVideo(
                mediaURL: mediaURL,
                proxyURL: nil,
                duration: max(source.duration ?? 0, 0),
                offset: offset,
                is360: false
            )

            return VideoLane(
                name: semantic.name,
                sourceVideo: sourceVideo,
                tags: tags(for: source, graph: graph),
                metadata: semantic.metadata
            )
        }

        lanes.sort { lhs, rhs in
            let lhsRank = laneSortRank(lhs)
            let rhsRank = laneSortRank(rhs)
            if lhsRank != rhsRank { return lhsRank < rhsRank }
            return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
        }

        let title = packet.episodeSlug
            .replacingOccurrences(of: "-", with: " ")
            .capitalized

        let sequence = MediaSequence(
            title: "\(title) Premiere Rescue",
            lanes: lanes
        )

        return VideoProject(
            title: "\(title) Native Edit",
            sequences: [sequence]
        )
    }

    private static func deriveOffset(for source: PremierePacketSource, graph: PremiereEditGraph) -> Double {
        if let firstActiveDecision = graph.editDecisions
            .filter({ $0.sourceAssetId == source.id && $0.isActive == true })
            .sorted(by: { $0.timelineStart < $1.timelineStart })
            .first {
            return firstActiveDecision.timelineStart - firstActiveDecision.sourceStart
        }

        if let sync = graph.syncMaps.first(where: { $0.sourceAssetId == source.id }) {
            return sync.timelineAnchor - sync.sourceAnchor
        }

        return 0
    }

    private static func tags(for source: PremierePacketSource, graph: PremiereEditGraph) -> [VideoTag] {
        graph.editDecisions
            .filter { $0.sourceAssetId == source.id }
            .compactMap { decision in
                guard decision.duration > 0 else { return nil }
                let tagType: TagType = decision.isActive == true ? .active : .cut
                return VideoTag(
                    type: tagType,
                    startTime: max(0, decision.sourceStart),
                    duration: decision.duration
                )
            }
            .sorted { $0.startTime < $1.startTime }
    }

    private static func laneSortRank(_ lane: VideoLane) -> Int {
        let name = lane.name.lowercased()
        let path = lane.sourceVideo?.mediaURL.path.lowercased() ?? ""
        let role = lane.metadata?.role.lowercased() ?? ""
        if role == "charlie_camera" { return 0 }
        if role == "homer_camera" { return 1 }
        if role == "unresolved_camera" { return 2 }
        if role == "reference_clip" || role == "source_clip" { return 3 }
        if role == "charlie_audio" { return 4 }
        if role == "homer_audio" { return 5 }
        if role.contains("audio") { return 6 }
        if name.contains("charlie camera") { return 0 }
        if name.contains("homer camera") { return 1 }
        if name.contains("clip") || path.contains("/clips/") { return 3 }
        if name.contains("charlie audio") { return 4 }
        if name.contains("homer audio") { return 5 }
        if path.hasSuffix(".wav") || path.hasSuffix(".m4a") || path.hasSuffix(".mp3") { return 6 }
        return 7
    }

    private static func laneSemantic(for source: PremierePacketSource) -> LaneSemantic {
        let name = source.displayName
        let path = "\(source.localPath ?? "") \(source.originalPath ?? "")".lowercased()
        let lowercasedName = name.lowercased()
        let kind = inferredKind(for: source)
        let role = source.role?.lowercased() ?? ""
        let trackIds = source.trackIds ?? []
        let trackSuffix = trackIds.isEmpty ? "" : "\(trackIds.joined(separator: ",")) "
        let hasConcretePath = !(source.localPath ?? source.originalPath ?? "").isEmpty
        let isGenericPremiereVideo = lowercasedName.hasPrefix("video clip") ||
            lowercasedName.hasPrefix("temp_video") ||
            (role.contains("episode-media") && !hasConcretePath)

        if role.contains("reference") || path.contains("/clips/") {
            return LaneSemantic(source: source, name: "Reference Clip - \(name)", mediaKind: kind, role: "reference_clip")
        }

        if role.contains("video-source") {
            return LaneSemantic(source: source, name: "Source Clip \(trackSuffix)- \(name)", mediaKind: kind, role: "source_clip")
        }

        if kind == "audio" {
            if path.contains("charlie") || lowercasedName.contains("first pod") {
                return LaneSemantic(source: source, name: "Charlie Audio - \(name)", mediaKind: kind, role: "charlie_audio")
            }

            if path.contains("homer") || lowercasedName.contains("homer") {
                return LaneSemantic(source: source, name: "Homer Audio - \(name)", mediaKind: kind, role: "homer_audio")
            }

            return LaneSemantic(source: source, name: "Audio \(trackSuffix)- \(name)", mediaKind: kind, role: "audio")
        }

        if path.contains("charlie") || lowercasedName.contains("charlie") || lowercasedName.contains("mvi_") {
            return LaneSemantic(source: source, name: "Charlie Camera - \(name)", mediaKind: kind, role: "charlie_camera")
        }

        if path.contains("homer") || lowercasedName.contains("homer") {
            return LaneSemantic(source: source, name: "Homer Camera - \(name)", mediaKind: kind, role: "homer_camera")
        }

        if isGenericPremiereVideo {
            return LaneSemantic(source: source, name: "Unresolved Camera \(trackSuffix)- \(name)", mediaKind: kind, role: "unresolved_camera")
        }

        return LaneSemantic(source: source, name: "Camera \(trackSuffix)- \(name)", mediaKind: kind, role: "camera")
    }

    private static func inferredKind(for source: PremierePacketSource) -> String {
        if let kind = source.kind?.lowercased(), !kind.isEmpty {
            return kind
        }

        let path = "\(source.localPath ?? "") \(source.originalPath ?? "") \(source.displayName)".lowercased()
        if path.hasSuffix(".wav") || path.hasSuffix(".m4a") || path.hasSuffix(".mp3") || path.hasSuffix(".aac") || path.hasSuffix(".flac") {
            return "audio"
        }
        if path.hasSuffix(".mp4") || path.hasSuffix(".mov") || path.hasSuffix(".m4v") || path.hasSuffix(".insv") {
            return "video"
        }
        return "unknown"
    }
}

private struct LaneSemantic {
    let name: String
    let metadata: VideoLaneMetadata

    init(source: PremierePacketSource, name: String, mediaKind: String, role: String) {
        self.name = name.replacingOccurrences(of: "  ", with: " ")
        self.metadata = VideoLaneMetadata(
            sourceAssetId: source.id,
            mediaKind: mediaKind,
            role: role,
            trackIds: source.trackIds ?? [],
            sourcePath: source.localPath,
            originalPath: source.originalPath,
            declaredExists: source.exists,
            sourceLabel: source.displayName,
            isPremiereRescue: true
        )
    }
}

private struct PremiereRescuePacket: Decodable {
    let episodeSlug: String
    let quipslyEditGraph: PremiereEditGraph
}

private struct PremiereEditGraph: Decodable {
    let sources: [PremierePacketSource]
    let syncMaps: [PremiereSyncMap]
    let editDecisions: [PremiereEditDecision]
}

private struct PremierePacketSource: Decodable {
    let id: String
    let displayName: String
    let kind: String?
    let role: String?
    let duration: Double?
    let originalPath: String?
    let localPath: String?
    let exists: Bool?
    let trackIds: [String]?

    var resolvedURL: URL {
        if let localPath, !localPath.isEmpty {
            return URL(fileURLWithPath: localPath)
        }

        if let originalPath, !originalPath.isEmpty {
            return URL(fileURLWithPath: originalPath)
        }

        let safeName = displayName.replacingOccurrences(of: "/", with: "-")
        return URL(fileURLWithPath: "/__quipsly_missing_media__/\(safeName)")
    }
}

private struct PremiereSyncMap: Decodable {
    let sourceAssetId: String
    let timelineAnchor: Double
    let sourceAnchor: Double
}

private struct PremiereEditDecision: Decodable {
    let sourceAssetId: String
    let timelineStart: Double
    let duration: Double
    let sourceStart: Double
    let sourceEnd: Double?
    let isActive: Bool?
    let kind: String?
    let label: String?
}
