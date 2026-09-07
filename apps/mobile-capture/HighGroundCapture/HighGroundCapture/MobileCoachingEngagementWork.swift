import Foundation

struct MobileCoachingEngagementMember: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let role: String?
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

struct MobileCoachingEngagementWorkspace: Codable, Hashable {
    let id: String
    let title: String
    let status: String
    let canWrite: Bool
    let currentUserId: String
    let members: [MobileCoachingEngagementMember]
    let entries: [MobileCoachingEngagementWorkEntry]
}
