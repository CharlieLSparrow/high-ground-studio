import Foundation

enum AppSection: String, CaseIterable, Hashable, Identifiable {
    case dashboard
    case assumptions
    case nestProjects
    case manuscriptEditor
    case nestSession
    case mediaEngine
    case episodeEditor
    case episodeCollaboration
    case premiereDraftEdit
    case visionLab
    case localFiles
    case cloudSync
    case nestChat
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard: "Dashboard"
        case .assumptions: "Assumptions"
        case .nestProjects: "The Nest"
        case .manuscriptEditor: "Text Editor"
        case .nestSession: "Nest Session"
        case .mediaEngine: "Media Engine"
        case .episodeEditor: "Episode Editor"
        case .episodeCollaboration: "Episode Sync"
        case .premiereDraftEdit: "Premiere Draft Edit"
        case .visionLab: "Vision Lab"
        case .localFiles: "Local Files"
        case .cloudSync: "Cloud Sync"
        case .nestChat: "Nest Chat"
        case .settings: "Settings"
        }
    }

    var subtitle: String {
        switch self {
        case .dashboard: "Local cockpit"
        case .assumptions: "Product bets"
        case .nestProjects: "Projects and Nests"
        case .manuscriptEditor: "Writing and study docs"
        case .nestSession: "Sign in once"
        case .mediaEngine: "Video, proxies, offload"
        case .episodeEditor: "Nest timeline shell"
        case .episodeCollaboration: "Mako handoff"
        case .premiereDraftEdit: "Source + program review"
        case .visionLab: "Research photo workflows"
        case .localFiles: "Watched folders"
        case .cloudSync: "Vault status"
        case .nestChat: "Team memory and GIFs"
        case .settings: "Engine and Nest URLs"
        }
    }

    var symbol: String {
        switch self {
        case .dashboard: "gauge.with.dots.needle.67percent"
        case .assumptions: "list.bullet.clipboard"
        case .nestProjects: "square.grid.2x2"
        case .manuscriptEditor: "doc.richtext"
        case .nestSession: "person.crop.circle.badge.checkmark"
        case .mediaEngine: "film.stack"
        case .episodeEditor: "timeline.selection"
        case .episodeCollaboration: "person.2.wave.2"
        case .premiereDraftEdit: "rectangle.stack.badge.play"
        case .visionLab: "camera.macro"
        case .localFiles: "folder"
        case .cloudSync: "icloud.and.arrow.up"
        case .nestChat: "bubble.left.and.bubble.right"
        case .settings: "gearshape"
        }
    }
}
