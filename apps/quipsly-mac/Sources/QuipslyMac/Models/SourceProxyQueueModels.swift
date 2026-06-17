import Foundation

struct SourceProxyQueueSummary: Equatable {
    var total: Int
    var proxyReady: Int
    var proxyNeeded: Int
    var sourceNeedsHydration: Int
    var sourceMissing: Int
    var generating: Int
    var downloadRemainingBytes: Int64

    static let empty = SourceProxyQueueSummary(
        total: 0,
        proxyReady: 0,
        proxyNeeded: 0,
        sourceNeedsHydration: 0,
        sourceMissing: 0,
        generating: 0,
        downloadRemainingBytes: 0
    )
}

struct SourceProxyWorkspaceStatus: Equatable {
    var workspacePath: String
    var availableBytes: Int64?
    var lockPath: String
    var lockExists: Bool
    var lockAgeSeconds: TimeInterval?
    var lockDetails: String?
    var lastCheckedAt: Date

    static func unknown(workspacePath: String) -> SourceProxyWorkspaceStatus {
        SourceProxyWorkspaceStatus(
            workspacePath: workspacePath,
            availableBytes: nil,
            lockPath: "",
            lockExists: false,
            lockAgeSeconds: nil,
            lockDetails: nil,
            lastCheckedAt: Date()
        )
    }

    var availableLabel: String {
        guard let availableBytes else { return "Unknown space" }
        return ByteCountFormatter.string(fromByteCount: availableBytes, countStyle: .file)
    }

    var lockLabel: String {
        guard lockExists else { return "No proxy lock" }
        if let lockAgeSeconds {
            let minutes = Int(lockAgeSeconds / 60)
            return "Proxy lock present for \(minutes)m"
        }
        return "Proxy lock present"
    }

    var hasStaleProxyLock: Bool {
        guard lockExists, let lockAgeSeconds else { return false }
        return lockAgeSeconds > 60 * 60 * 2
    }

    var canClearStaleProxyLock: Bool {
        hasStaleProxyLock
    }
}

enum SourceHydrationState: String, Codable, Sendable {
    case localReady
    case cloudLinked
    case partialLocal
    case missing
    case proxyOnly
    case unknown

    var label: String {
        switch self {
        case .localReady: return "Source local"
        case .cloudLinked: return "Needs download"
        case .partialLocal: return "Partially local"
        case .missing: return "Missing source"
        case .proxyOnly: return "Proxy only"
        case .unknown: return "Needs review"
        }
    }

    var explanation: String {
        switch self {
        case .localReady:
            return "The source appears physically present enough for proxying or export."
        case .cloudLinked:
            return "The path points into cloud storage. Make it available offline before proxying large sections."
        case .partialLocal:
            return "The file has a real size, but only part of the bytes appear local. Finish downloading first."
        case .missing:
            return "Quipsly has a path, but the source is not reachable from this Mac."
        case .proxyOnly:
            return "The editor has a proxy, but the original source is not linked for final export yet."
        case .unknown:
            return "Quipsly could not confidently classify this source. Reveal it and inspect in Finder."
        }
    }

    var isActionableForProxy: Bool {
        self == .localReady
    }

    var needsHumanHydration: Bool {
        self == .cloudLinked || self == .partialLocal || self == .missing || self == .unknown
    }
}

enum SourceProxyState: String, Codable, Sendable {
    case ready
    case needed
    case notVideo
    case generating
    case failed

    var label: String {
        switch self {
        case .ready: return "Proxy ready"
        case .needed: return "Proxy needed"
        case .notVideo: return "No proxy needed"
        case .generating: return "Generating proxy"
        case .failed: return "Proxy failed"
        }
    }
}

struct SourceProxyQueueItem: Identifiable, Codable, Equatable, Sendable {
    var id: String
    var projectSlug: String
    var episodeSlug: String
    var sourceAssetId: String
    var displayName: String
    var kind: String
    var sourcePath: String
    var currentPlaybackPath: String?
    var proxyPath: String
    var clipCount: Int
    var trackIds: [String]
    var logicalBytes: Int64
    var allocatedBytes: Int64
    var isSymlink: Bool
    var symlinkTarget: String?
    var sourceState: SourceHydrationState
    var proxyState: SourceProxyState
    var lastError: String?

    var isVideoLike: Bool {
        kind.lowercased() == "video" || trackIds.contains { $0.uppercased().hasPrefix("V") }
    }

    var canGenerateProxy: Bool {
        isVideoLike && sourceState.isActionableForProxy && proxyState != .ready && proxyState != .generating
    }

    func isVaulted(in workspacePath: String) -> Bool {
        let normalizedWorkspace = URL(fileURLWithPath: workspacePath, isDirectory: true).standardizedFileURL.path
        return URL(fileURLWithPath: sourcePath).standardizedFileURL.path
            .hasPrefix("\(normalizedWorkspace)/source-originals/")
    }

    func canVaultSource(in workspacePath: String) -> Bool {
        sourceState.isActionableForProxy && !isVaulted(in: workspacePath)
    }

    var logicalSizeLabel: String {
        ByteCountFormatter.string(fromByteCount: logicalBytes, countStyle: .file)
    }

    var allocatedSizeLabel: String {
        ByteCountFormatter.string(fromByteCount: allocatedBytes, countStyle: .file)
    }

    var downloadRemainingBytes: Int64 {
        guard sourceState.needsHumanHydration else { return 0 }
        return max(0, logicalBytes - allocatedBytes)
    }

    var downloadRemainingLabel: String {
        ByteCountFormatter.string(fromByteCount: downloadRemainingBytes, countStyle: .file)
    }

    var localProgressFraction: Double? {
        guard logicalBytes > 0 else { return nil }
        return min(1, max(0, Double(allocatedBytes) / Double(logicalBytes)))
    }

    var localProgressLabel: String {
        guard let localProgressFraction else { return "Unknown local bytes" }
        if localProgressFraction >= 0.995 { return "Local bytes ready" }
        let percent = Int((localProgressFraction * 100).rounded(.down))
        return "\(percent)% local"
    }

    var sourceLocationLabel: String {
        if let symlinkTarget, !symlinkTarget.isEmpty {
            return symlinkTarget
        }
        return sourcePath
    }

    var primaryActionLabel: String {
        if proxyState == .ready { return "Reveal proxy" }
        if canGenerateProxy { return "Generate proxy" }
        if sourceState.needsHumanHydration { return "Reveal source" }
        return "Review" 
    }
}

struct SourceProxyQueueDiagnosticPacket: Codable, Sendable {
    var generatedAt: String
    var workspacePath: String
    var items: [SourceProxyQueueItem]
    var summary: SourceProxyQueueSummaryPacket
}

struct SourceProxyQueueSummaryPacket: Codable, Sendable {
    var total: Int
    var proxyReady: Int
    var proxyNeeded: Int
    var sourceNeedsHydration: Int
    var sourceMissing: Int
    var generating: Int
    var downloadRemainingBytes: Int64

    init(summary: SourceProxyQueueSummary) {
        total = summary.total
        proxyReady = summary.proxyReady
        proxyNeeded = summary.proxyNeeded
        sourceNeedsHydration = summary.sourceNeedsHydration
        sourceMissing = summary.sourceMissing
        generating = summary.generating
        downloadRemainingBytes = summary.downloadRemainingBytes
    }
}
