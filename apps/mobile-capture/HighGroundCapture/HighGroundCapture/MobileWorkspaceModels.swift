import Foundation

enum MobileWorkspaceSection: String, CaseIterable, Identifiable {
    case session
    case editor
    case media
    case recorder
    case chat
    case publish

    var id: String { rawValue }

    var title: String {
        switch self {
        case .session: "Session"
        case .editor: "Editor"
        case .media: "Media"
        case .recorder: "Record"
        case .chat: "Chat"
        case .publish: "Publish"
        }
    }

    var systemImage: String {
        switch self {
        case .session: "doc.text.magnifyingglass"
        case .editor: "slider.horizontal.3"
        case .media: "photo.stack"
        case .recorder: "mic.circle"
        case .chat: "bubble.left.and.bubble.right"
        case .publish: "paperplane"
        }
    }
}

enum MobileInspectorMode: String, CaseIterable, Identifiable {
    case outline
    case clip
    case tags
    case sync

    var id: String { rawValue }

    var title: String {
        switch self {
        case .outline: "Outline"
        case .clip: "Clip"
        case .tags: "Tags"
        case .sync: "Sync"
        }
    }
}

struct MobileManuscriptBlock: Identifiable, Hashable {
    let id: String
    let label: String
    let title: String
    let body: String
    let speaker: String?
    let tags: [String]
    let clipCue: MobileClipCue?

    static let sample: [MobileManuscriptBlock] = [
        MobileManuscriptBlock(
            id: "chapter-preface",
            label: "Chapter",
            title: "The Wednesday Rule",
            body: "Open with the rule as a lived idea, not a thesis. The point is to make the conversation feel like a trailhead.",
            speaker: nil,
            tags: ["Chapter", "Episode"],
            clipCue: MobileClipCue(title: "Opening YouTube reference", timeRange: "00:02-00:37", status: "Ready to watch")
        ),
        MobileManuscriptBlock(
            id: "show-note-1",
            label: "Show Note",
            title: "Shared note",
            body: "Keep this visible during recording: slow down after the quote, then ask Homer for the practical version.",
            speaker: "Charlie",
            tags: ["Show Note"],
            clipCue: nil
        ),
        MobileManuscriptBlock(
            id: "quote-1",
            label: "Quote",
            title: "Benjamin Franklin",
            body: "The quote block is treated as a durable cue. We can discuss it, tag it, and later link it to QuipLore.",
            speaker: "Homer",
            tags: ["Quote", "Discussion"],
            clipCue: nil
        ),
    ]
}

struct MobileClipCue: Hashable {
    let title: String
    let timeRange: String
    let status: String
}

struct MobileQuickAction: Identifiable {
    let id = UUID()
    let title: String
    let systemImage: String
    let detail: String

    static let iPadActions = [
        MobileQuickAction(title: "Mark chapter", systemImage: "bookmark", detail: "Turn selected block into structure"),
        MobileQuickAction(title: "Add clip cue", systemImage: "play.rectangle", detail: "Attach media without leaving text"),
        MobileQuickAction(title: "Nudge sync", systemImage: "arrow.left.and.right", detail: "Adjust selected media"),
        MobileQuickAction(title: "Send to Nest", systemImage: "icloud.and.arrow.up", detail: "Persist when safe"),
    ]

    static let iPhoneActions = [
        MobileQuickAction(title: "Record", systemImage: "mic.fill", detail: "High quality local audio"),
        MobileQuickAction(title: "Cue clip", systemImage: "play.fill", detail: "Watch together"),
        MobileQuickAction(title: "Mark break", systemImage: "scissors", detail: "Preserve sync spine"),
    ]
}
