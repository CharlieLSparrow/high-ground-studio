import Foundation

struct MobileCoachingEngagementMember: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let role: String?
}

/// Display projection of a canonical Nest tag, not a separate native taxonomy.
struct MobileWorkTagLabel: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let hexColor: String?
    let isActive: Bool
}

struct MobileTaskTagContextResponse: Decodable {
    let ok: Bool
    let tags: [MobileWorkTagLabel]?
    let error: String?
}

/// The canonical client-space response, shared by the web and native work views.
struct MobileCoachingEngagementWorkEntry: Codable, Identifiable, Hashable {
    let id: String
    let kind: String
    let title: String?
    let body: String?
    let status: String?
    let owner: MobileCoachingEngagementMember?
    let visibility: String
    let dueAt: String?
    let canEdit: Bool
    let canChangeVisibility: Bool?
    let createdAt: String
    let updatedAt: String
    var sourceHref: String? = nil
    var tags: [MobileWorkTagLabel]? = nil

    var displayTitle: String {
        let text = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? "Untitled \(kindLabel.lowercased())" : text
    }

    var sourceLink: CaptureTranscriptWorkLink? {
        sourceHref.flatMap { CaptureTranscriptWorkLink(href: $0) }
    }

    var isComplete: Bool { status == "DONE" || status == "ACHIEVED" }

    var kindLabel: String {
        switch kind {
        case "TASK": "Task"
        case "GOAL": "Goal"
        default: "Note"
        }
    }
}

struct MobileCoachingWorkPage: Codable, Hashable {
    let nextCursor: String?
    let pageSize: Int
    let query: String
    let kind: String
}

/// Only completed reads extend the history. Changing search immediately drops
/// the old cursor chain, including when the new request subsequently fails.
struct MobileCoachingWorkHistory {
    static func normalizedSearch(_ value: String) -> String {
        value.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
    private(set) var query = ""
    private(set) var kind = "ALL"
    private(set) var cursors: [String?] = [nil]

    mutating func request(search: String?, kind nextKind: String? = nil, including cursor: String?) -> [String?] {
        let nextQuery = search.map(Self.normalizedSearch) ?? query
        let kind = nextKind ?? self.kind
        if nextQuery != query || kind != self.kind { query = nextQuery; self.kind = kind; cursors = [nil] }
        var requested = cursors
        if let cursor, !requested.contains(cursor) { requested.append(cursor) }
        return requested
    }

    mutating func didLoad(_ requested: [String?]) { cursors = requested }
}

struct MobileCoachingEngagementWorkspace: Codable, Hashable {
    let id: String
    let title: String
    let status: String
    let canWrite: Bool
    let currentUserId: String
    let members: [MobileCoachingEngagementMember]
    let entries: [MobileCoachingEngagementWorkEntry]
    var page: MobileCoachingWorkPage? = nil
}
