import AppKit
import Darwin
import Foundation

@MainActor
final class SourceProxyQueueStore: ObservableObject {
    @Published private(set) var items: [SourceProxyQueueItem] = []
    @Published private(set) var lastMessage = "Scan an episode to see which sources need local download or proxy generation."
    @Published private(set) var isScanning = false
    @Published private(set) var activeProxyItemID: String?
    @Published private(set) var activeVaultItemID: String?
    @Published private(set) var lastManifestURL: URL?
    @Published private(set) var workspaceStatus = SourceProxyWorkspaceStatus.unknown(workspacePath: "")

    var summary: SourceProxyQueueSummary {
        SourceProxyQueueSummary(
            total: items.count,
            proxyReady: items.filter { $0.proxyState == .ready }.count,
            proxyNeeded: items.filter { $0.proxyState == .needed || $0.proxyState == .failed }.count,
            sourceNeedsHydration: items.filter { $0.sourceState.needsHumanHydration }.count,
            sourceMissing: items.filter { $0.sourceState == .missing }.count,
            generating: activeProxyItemID == nil ? 0 : 1,
            downloadRemainingBytes: items.reduce(Int64(0)) { partial, item in
                partial + item.downloadRemainingBytes
            }
        )
    }

    func scanCurrentEpisode(projectSlug: String, episodeSlug: String, workspacePath: String) {
        scan(projectSlug: projectSlug, episodeSlugs: [episodeSlug], workspacePath: workspacePath)
    }

    func scanPremiereRescueEpisodes(projectSlug: String, workspacePath: String) {
        scan(projectSlug: projectSlug, episodeSlugs: ["episode-1", "episode-2", "episode-3"], workspacePath: workspacePath)
    }

    func scan(projectSlug: String, episodeSlugs: [String], workspacePath: String) {
        guard !isScanning else {
            lastMessage = "A source/proxy scan is already running."
            return
        }

        isScanning = true
        workspaceStatus = inspectSourceProxyWorkspace(workspacePath: workspacePath)
        lastMessage = "Scanning source hydration and proxy state..."

        Task {
            let result = await Task.detached(priority: .userInitiated) {
                scanEpisodeSources(projectSlug: projectSlug, episodeSlugs: episodeSlugs, workspacePath: workspacePath)
            }.value

            items = result.items
            lastManifestURL = result.manifestURL
            workspaceStatus = inspectSourceProxyWorkspace(workspacePath: workspacePath)
            isScanning = false
            if !result.items.isEmpty, let actionPlanURL = try? writeLatestActionPlanFile(workspacePath: workspacePath) {
                lastManifestURL = actionPlanURL
                lastMessage = "\(result.message) Latest action plan saved to \(actionPlanURL.lastPathComponent)."
            } else {
                lastMessage = result.message
            }
        }
    }

    func generateProxy(for itemID: String, workspacePath: String) {
        workspaceStatus = inspectSourceProxyWorkspace(workspacePath: workspacePath)
        guard activeProxyItemID == nil else {
            lastMessage = "A proxy job is already running. Let it finish before starting another."
            return
        }
        guard activeVaultItemID == nil else {
            lastMessage = "A source vault job is already running. Let it finish before starting proxy work."
            return
        }

        guard let item = items.first(where: { $0.id == itemID }) else {
            lastMessage = "That source is no longer in the queue. Scan again."
            return
        }

        guard item.canGenerateProxy else {
            lastMessage = "Proxy is not ready to start for \(item.displayName). \(item.sourceState.explanation)"
            return
        }

        activeProxyItemID = item.id
        workspaceStatus = inspectSourceProxyWorkspace(workspacePath: workspacePath)
        updateItem(item.id) { queued in
            queued.proxyState = .generating
            queued.lastError = nil
        }
        lastMessage = "Generating editor proxy for \(item.displayName). Quipsly will update the local episode after ffmpeg finishes."

        Task {
            let result = await Task.detached(priority: .userInitiated) {
                generateProxyAndRelink(item: item, workspacePath: workspacePath)
            }.value

            activeProxyItemID = nil
            workspaceStatus = inspectSourceProxyWorkspace(workspacePath: workspacePath)

            switch result {
            case .success(let updatedItem, let message):
                updateItem(updatedItem.id) { existing in
                    existing.proxyState = .ready
                    existing.currentPlaybackPath = updatedItem.proxyPath
                    existing.lastError = nil
                }
                lastMessage = message
                scanCurrentEpisode(projectSlug: item.projectSlug, episodeSlug: item.episodeSlug, workspacePath: workspacePath)
            case .failure(let message):
                updateItem(item.id) { failed in
                    failed.proxyState = .failed
                    failed.lastError = message
                }
                lastMessage = message
            }
        }
    }

    func generateNextReadyProxy(workspacePath: String) {
        guard let next = items.first(where: { $0.canGenerateProxy }) else {
            lastMessage = "No proxy-ready source found. Download cloud-linked sources first, then scan again."
            return
        }
        generateProxy(for: next.id, workspacePath: workspacePath)
    }

    func vaultNextReadySource(workspacePath: String) {
        guard let next = items.first(where: { $0.canVaultSource(in: workspacePath) }) else {
            lastMessage = "No local unvaulted source found. Download cloud-linked sources first, then scan again."
            return
        }
        vaultSource(itemID: next.id, workspacePath: workspacePath)
    }

    func copyReadyActionPlan(workspacePath: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(sourceProxyActionPlanText(workspacePath: workspacePath, items: items), forType: .string)
        lastMessage = "Copied source/proxy action plan."
    }

    func saveActionPlan(workspacePath: String) {
        guard !items.isEmpty else {
            lastMessage = "No source/proxy queue items to save yet. Scan an episode first."
            return
        }

        do {
            let planURL = try writeActionPlanFile(workspacePath: workspacePath)
            lastManifestURL = planURL
            lastMessage = "Saved source/proxy action plan to \(planURL.path)."
            NSWorkspace.shared.activateFileViewerSelecting([planURL])
        } catch {
            lastMessage = "Could not save action plan: \(error.localizedDescription)"
        }
    }

    func refreshWorkspaceStatus(workspacePath: String) {
        workspaceStatus = inspectSourceProxyWorkspace(workspacePath: workspacePath)
        lastMessage = "Workspace checked: \(workspaceStatus.availableLabel), \(workspaceStatus.lockLabel)."
    }

    func clearStaleProxyLock(workspacePath: String) {
        let status = inspectSourceProxyWorkspace(workspacePath: workspacePath)
        workspaceStatus = status
        guard status.canClearStaleProxyLock else {
            lastMessage = "Proxy lock was not cleared. It is either absent or not old enough to be considered stale."
            return
        }

        do {
            try FileManager.default.removeItem(atPath: status.lockPath)
            workspaceStatus = inspectSourceProxyWorkspace(workspacePath: workspacePath)
            lastMessage = "Cleared stale proxy lock."
        } catch {
            lastMessage = "Could not clear stale proxy lock: \(error.localizedDescription)"
        }
    }

    func prepareHydration(workspacePath: String) {
        let rows = items.filter { $0.sourceState.needsHumanHydration }
        guard !rows.isEmpty else {
            lastMessage = "No source downloads are needed right now."
            return
        }

        do {
            let planURL = try writeActionPlanFile(workspacePath: workspacePath)
            lastManifestURL = planURL
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(sourceProxyHydrationChecklistText(items: rows), forType: .string)
            revealSource(itemID: rows[0].id)
            lastMessage = "Prepared download checklist for \(rows.count) source\(rows.count == 1 ? "" : "s"), saved \(planURL.lastPathComponent), and revealed the first source."
        } catch {
            lastMessage = "Could not prepare downloads: \(error.localizedDescription)"
        }
    }

    func revealSource(itemID: String) {
        guard let item = items.first(where: { $0.id == itemID }) else { return }
        reveal(path: item.sourceLocationLabel)
        lastMessage = "Revealed source for \(item.displayName). If Finder shows a cloud icon, choose Download Now or Make Available Offline."
    }

    func revealProxy(itemID: String) {
        guard let item = items.first(where: { $0.id == itemID }) else { return }
        reveal(path: item.proxyPath)
        lastMessage = "Revealed proxy location for \(item.displayName)."
    }

    func revealFirstHydrationNeed() {
        guard let item = items.first(where: { $0.sourceState.needsHumanHydration }) else {
            lastMessage = "No download-needed source is currently in the queue."
            return
        }

        revealSource(itemID: item.id)
    }

    func vaultSource(itemID: String, workspacePath: String) {
        workspaceStatus = inspectSourceProxyWorkspace(workspacePath: workspacePath)
        guard activeProxyItemID == nil else {
            lastMessage = "A proxy job is already running. Let it finish before vaulting originals."
            return
        }
        guard activeVaultItemID == nil else {
            lastMessage = "A source vault job is already running."
            return
        }
        guard let item = items.first(where: { $0.id == itemID }) else {
            lastMessage = "That source is no longer in the queue. Scan again."
            return
        }
        guard item.canVaultSource(in: workspacePath) else {
            lastMessage = "\(item.displayName) is not ready to vault. \(item.sourceState.explanation)"
            return
        }

        activeVaultItemID = item.id
        workspaceStatus = inspectSourceProxyWorkspace(workspacePath: workspacePath)
        lastMessage = "Vaulting \(item.displayName) into source-originals. This can take a while for huge files."

        Task {
            let result = await Task.detached(priority: .userInitiated) {
                vaultSourceOriginal(item: item, workspacePath: workspacePath)
            }.value

            activeVaultItemID = nil
            workspaceStatus = inspectSourceProxyWorkspace(workspacePath: workspacePath)
            switch result {
            case .success(_, let message):
                lastMessage = message
                scanCurrentEpisode(projectSlug: item.projectSlug, episodeSlug: item.episodeSlug, workspacePath: workspacePath)
            case .failure(let message):
                updateItem(item.id) { failed in
                    failed.lastError = message
                }
                lastMessage = message
            }
        }
    }

    func copyDiagnostics(workspacePath: String) {
        let packet = SourceProxyQueueDiagnosticPacket(
            generatedAt: Date().ISO8601Format(),
            workspacePath: workspacePath,
            items: items,
            summary: SourceProxyQueueSummaryPacket(summary: summary)
        )

        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(packet)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(String(decoding: data, as: UTF8.self), forType: .string)
            lastMessage = "Copied source/proxy queue diagnostics."
        } catch {
            lastMessage = "Could not copy diagnostics: \(error.localizedDescription)"
        }
    }

    func copyHydrationChecklist() {
        let rows = items.filter { $0.sourceState.needsHumanHydration }
        guard !rows.isEmpty else {
            lastMessage = "No hydration checklist needed right now."
            return
        }

        let text = sourceProxyHydrationChecklistText(items: rows)

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        lastMessage = "Copied hydration checklist for \(rows.count) source\(rows.count == 1 ? "" : "s")."
    }

    private func writeActionPlanFile(workspacePath: String) throws -> URL {
        let project = items.first?.projectSlug ?? "unknown-project"
        let episode = items.map(\.episodeSlug).sorted().first ?? "unknown-episode"
        let directory = QuipslyMediaWorkspace.rootURL(rootPath: workspacePath)
            .appendingPathComponent("operator-action-plans", isDirectory: true)
            .appendingPathComponent(safePathComponent(project), isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let timestamp = Date().ISO8601Format()
            .replacingOccurrences(of: ":", with: "-")
            .replacingOccurrences(of: ".", with: "-")
        let url = directory.appendingPathComponent("\(safePathComponent(episode))-source-proxy-\(timestamp).md", isDirectory: false)
        try sourceProxyActionPlanText(workspacePath: workspacePath, items: items).write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    private func writeLatestActionPlanFile(workspacePath: String) throws -> URL {
        let project = items.first?.projectSlug ?? "unknown-project"
        let episode = items.map(\.episodeSlug).sorted().first ?? "unknown-episode"
        let directory = QuipslyMediaWorkspace.rootURL(rootPath: workspacePath)
            .appendingPathComponent("operator-action-plans", isDirectory: true)
            .appendingPathComponent(safePathComponent(project), isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let url = directory.appendingPathComponent("\(safePathComponent(episode))-source-proxy-latest.md", isDirectory: false)
        try sourceProxyActionPlanText(workspacePath: workspacePath, items: items).write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    private func updateItem(_ id: String, mutate: (inout SourceProxyQueueItem) -> Void) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        mutate(&items[index])
    }
}

private func sourceProxyActionPlanText(workspacePath: String, items: [SourceProxyQueueItem]) -> String {
    let readyToVault = items.filter { $0.canVaultSource(in: workspacePath) }
    let readyToProxy = items.filter { $0.canGenerateProxy }
    let needsDownload = items.filter { $0.sourceState.needsHumanHydration }
    let missing = items.filter { $0.sourceState == .missing }
    let status = inspectSourceProxyWorkspace(workspacePath: workspacePath)

    return """
    # Quipsly source/proxy action plan

    Generated: \(Date().ISO8601Format())
    Workspace: \(workspacePath)
    Sources: \(items.count)

    ## Workspace status

    Available space: \(status.availableLabel)
    Proxy lock: \(status.lockLabel)
    Lock path: \(status.lockPath.isEmpty ? "None" : status.lockPath)
    Lock details: \(status.lockDetails?.isEmpty == false ? status.lockDetails! : "None")

    ## Ready to vault

    \(readyToVault.isEmpty ? "None right now." : readyToVault.map { "- \($0.episodeSlug) · \($0.displayName) · \($0.sourceLocationLabel)" }.joined(separator: "\n"))

    ## Ready to proxy

    \(readyToProxy.isEmpty ? "None right now." : readyToProxy.map { "- \($0.episodeSlug) · \($0.displayName) · proxy target: \($0.proxyPath)" }.joined(separator: "\n"))

    ## Needs download / review

    \(needsDownload.isEmpty ? "None right now." : sourceProxyHydrationChecklistText(items: needsDownload))

    ## Missing sources

    \(missing.isEmpty ? "None right now." : missing.map { "- \($0.episodeSlug) · \($0.displayName) · \($0.sourceLocationLabel)" }.joined(separator: "\n"))
    """
}

private func sourceProxyHydrationChecklistText(items: [SourceProxyQueueItem]) -> String {
    items.map { item in
        """
        - \(item.episodeSlug) · \(item.displayName)
          State: \(item.sourceState.label)
          Size: \(item.allocatedSizeLabel) local / \(item.logicalSizeLabel) logical
          Progress: \(item.localProgressLabel)
          Remaining: \(item.downloadRemainingLabel)
          Source: \(item.sourceLocationLabel)
          Next: Reveal source in Finder. For Google Drive/iCloud/File Provider files, choose Download Now or Make Available Offline. Rescan after Finder finishes downloading real bytes.
        """
    }.joined(separator: "\n")
}

private func inspectSourceProxyWorkspace(workspacePath: String) -> SourceProxyWorkspaceStatus {
    let rootURL = QuipslyMediaWorkspace.rootURL(rootPath: workspacePath)
    try? FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

    let availableBytes = (try? FileManager.default.attributesOfFileSystem(forPath: rootURL.path)[.systemFreeSize] as? NSNumber)?
        .int64Value

    let lockURL = proxyWorkspaceLockURL(workspacePath: workspacePath)
    let attributes = try? FileManager.default.attributesOfItem(atPath: lockURL.path)
    let lockExists = attributes != nil
    let modifiedAt = attributes?[.modificationDate] as? Date
    let lockAgeSeconds = modifiedAt.map { Date().timeIntervalSince($0) }
    let details = (try? String(contentsOf: lockURL, encoding: .utf8))?
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .prefix(240)

    return SourceProxyWorkspaceStatus(
        workspacePath: rootURL.path,
        availableBytes: availableBytes,
        lockPath: lockURL.path,
        lockExists: lockExists,
        lockAgeSeconds: lockAgeSeconds,
        lockDetails: details.map(String.init),
        lastCheckedAt: Date()
    )
}

private struct SourceProxyScanResult: Sendable {
    var items: [SourceProxyQueueItem]
    var manifestURL: URL?
    var message: String
}

private enum ProxyGenerationResult: Sendable {
    case success(SourceProxyQueueItem, String)
    case failure(String)
}

private struct SourceCandidate: Sendable {
    var sourceAssetId: String
    var displayName: String
    var kind: String
    var sourcePath: String
    var currentPlaybackPath: String?
    var clipCount: Int
    var trackIds: Set<String>
}

private struct FileFootprint: Sendable {
    var exists: Bool
    var logicalBytes: Int64
    var allocatedBytes: Int64
    var isSymlink: Bool
    var symlinkTarget: String?
    var resolvedPath: String?
    var pathLooksCloudBacked: Bool
}

private func scanEpisodeSources(projectSlug: String, episodeSlugs: [String], workspacePath: String) -> SourceProxyScanResult {
    var scanned: [SourceProxyQueueItem] = []
    var missingSessions: [String] = []

    for episodeSlug in episodeSlugs {
        let url = localEpisodeSessionURL(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard FileManager.default.fileExists(atPath: url.path) else {
            missingSessions.append(episodeSlug)
            continue
        }

        do {
            let session = try JSONDecoder().decode(LocalEpisodeEditSession.self, from: Data(contentsOf: url))
            let candidates = sourceCandidates(from: session)
            for candidate in candidates {
                scanned.append(queueItem(candidate: candidate, projectSlug: projectSlug, episodeSlug: episodeSlug, workspacePath: workspacePath))
            }
        } catch {
            missingSessions.append("\(episodeSlug) unreadable: \(error.localizedDescription)")
        }
    }

    scanned.sort { left, right in
        if left.episodeSlug != right.episodeSlug { return left.episodeSlug < right.episodeSlug }
        if left.sourceState != right.sourceState { return stateSort(left.sourceState) < stateSort(right.sourceState) }
        return left.displayName.localizedCaseInsensitiveCompare(right.displayName) == .orderedAscending
    }

    let message: String
    if scanned.isEmpty {
        message = missingSessions.isEmpty
            ? "No source media found in the selected local episode sessions."
            : "No queue items found. Missing sessions: \(missingSessions.joined(separator: ", "))."
    } else if missingSessions.isEmpty {
        message = "Scanned \(scanned.count) source group\(scanned.count == 1 ? "" : "s")."
    } else {
        message = "Scanned \(scanned.count) source group\(scanned.count == 1 ? "" : "s"). Missing: \(missingSessions.joined(separator: ", "))."
    }

    return SourceProxyScanResult(items: scanned, manifestURL: nil, message: message)
}

private func sourceCandidates(from session: LocalEpisodeEditSession) -> [SourceCandidate] {
    var grouped: [String: SourceCandidate] = [:]

    for decision in session.editDecisions {
        guard !decision.isPremiereInactiveGap else { continue }
        let playback = cleanPath(decision.playbackMediaPath)
        let local = cleanPath(decision.localMediaPath)
        let sourcePath: String

        if !local.isEmpty, !local.hasSuffix(".proxy.mp4") {
            sourcePath = local
        } else if !playback.isEmpty, !playback.hasSuffix(".proxy.mp4") {
            sourcePath = playback
        } else if !local.isEmpty {
            sourcePath = local
        } else {
            sourcePath = playback
        }

        guard !sourcePath.isEmpty else { continue }

        let key = "\(session.projectSlug)|\(session.episodeSlug)|\(decision.sourceAssetId)|\(sourcePath)"
        var candidate = grouped[key] ?? SourceCandidate(
            sourceAssetId: decision.sourceAssetId,
            displayName: decision.mediaDisplayName ?? decision.label,
            kind: decision.kind,
            sourcePath: sourcePath,
            currentPlaybackPath: playback.isEmpty ? nil : playback,
            clipCount: 0,
            trackIds: []
        )
        candidate.clipCount += 1
        candidate.trackIds.insert(decision.trackId)
        if candidate.currentPlaybackPath == nil, !playback.isEmpty {
            candidate.currentPlaybackPath = playback
        }
        grouped[key] = candidate
    }

    return Array(grouped.values)
}

private func queueItem(candidate: SourceCandidate, projectSlug: String, episodeSlug: String, workspacePath: String) -> SourceProxyQueueItem {
    let proxy = proxyURL(workspacePath: workspacePath, projectSlug: projectSlug, episodeSlug: episodeSlug, sourceAssetId: candidate.sourceAssetId, sourcePath: candidate.sourcePath)
    let sourceFootprint = fileFootprint(path: candidate.sourcePath)
    let proxyExists = FileManager.default.fileExists(atPath: proxy.path)
    let isVideoLike = candidate.kind.lowercased() == "video" || candidate.trackIds.contains { $0.uppercased().hasPrefix("V") }
    let sourceState = sourceState(for: sourceFootprint, sourcePath: candidate.sourcePath, proxyExists: proxyExists)
    let proxyState: SourceProxyState = isVideoLike ? (proxyExists ? .ready : .needed) : .notVideo

    return SourceProxyQueueItem(
        id: "\(projectSlug)|\(episodeSlug)|\(candidate.sourceAssetId)|\(candidate.sourcePath)",
        projectSlug: projectSlug,
        episodeSlug: episodeSlug,
        sourceAssetId: candidate.sourceAssetId,
        displayName: candidate.displayName,
        kind: candidate.kind,
        sourcePath: candidate.sourcePath,
        currentPlaybackPath: candidate.currentPlaybackPath,
        proxyPath: proxy.path,
        clipCount: candidate.clipCount,
        trackIds: Array(candidate.trackIds).sorted(),
        logicalBytes: sourceFootprint.logicalBytes,
        allocatedBytes: sourceFootprint.allocatedBytes,
        isSymlink: sourceFootprint.isSymlink,
        symlinkTarget: sourceFootprint.symlinkTarget,
        sourceState: sourceState,
        proxyState: proxyState,
        lastError: nil
    )
}

private func sourceState(for footprint: FileFootprint, sourcePath: String, proxyExists: Bool) -> SourceHydrationState {
    guard footprint.exists else {
        return proxyExists ? .proxyOnly : .missing
    }

    if sourcePath.hasSuffix(".proxy.mp4") {
        return .proxyOnly
    }

    let logical = max(footprint.logicalBytes, 0)
    let allocated = max(footprint.allocatedBytes, 0)
    let largeEnoughToCare = logical > 10 * 1024 * 1024
    let allocationRatio = logical > 0 ? Double(allocated) / Double(logical) : 1

    if footprint.pathLooksCloudBacked || footprint.isSymlink {
        if largeEnoughToCare && allocationRatio < 0.80 {
            return .cloudLinked
        }
        return .localReady
    }

    if largeEnoughToCare && allocated > 0 && allocationRatio < 0.80 {
        return .partialLocal
    }

    if largeEnoughToCare && allocated == 0 {
        return .cloudLinked
    }

    return .localReady
}

private func generateProxyAndRelink(item: SourceProxyQueueItem, workspacePath: String) -> ProxyGenerationResult {
    do {
        let releaseLock = try acquireProxyWorkspaceLock(workspacePath: workspacePath)
        defer { releaseLock() }

        try FileManager.default.createDirectory(at: URL(fileURLWithPath: item.proxyPath).deletingLastPathComponent(), withIntermediateDirectories: true)
        let tempProxy = "\(item.proxyPath).partial-\(ProcessInfo.processInfo.processIdentifier)-\(UUID().uuidString).mp4"
        try? FileManager.default.removeItem(atPath: tempProxy)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: ffmpegPath())
        process.arguments = [
            "-hide_banner",
            "-y",
            "-i", item.sourcePath,
            "-map", "0:v:0",
            "-map", "0:a?",
            "-vf", "scale=-2:\(proxyHeight())",
            "-c:v", proxyVideoCodec(),
            "-preset", proxyPreset(),
            "-crf", proxyCRF(),
            "-c:a", "aac",
            "-b:a", proxyAudioBitrate(),
            "-movflags", "+faststart",
            tempProxy,
        ]

        let pipe = Pipe()
        process.standardError = pipe
        process.standardOutput = Pipe()
        try process.run()
        process.waitUntilExit()

        guard process.terminationStatus == 0 else {
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(decoding: data, as: UTF8.self)
            try? FileManager.default.removeItem(atPath: tempProxy)
            return .failure("ffmpeg failed for \(item.displayName): \(output.prefix(600))")
        }

        if FileManager.default.fileExists(atPath: item.proxyPath) {
            try FileManager.default.removeItem(atPath: item.proxyPath)
        }
        try FileManager.default.moveItem(atPath: tempProxy, toPath: item.proxyPath)
        let changedClips = try relinkLocalEpisodeSessionToProxy(item: item)
        var updated = item
        updated.currentPlaybackPath = item.proxyPath
        updated.proxyState = .ready
        return .success(updated, "Generated proxy for \(item.displayName) and relinked \(changedClips) decision\(changedClips == 1 ? "" : "s") to proxy playback.")
    } catch {
        return .failure("Could not generate proxy for \(item.displayName): \(error.localizedDescription)")
    }
}

private func vaultSourceOriginal(item: SourceProxyQueueItem, workspacePath: String) -> ProxyGenerationResult {
    do {
        let destinationURL = sourceOriginalURL(
            workspacePath: workspacePath,
            projectSlug: item.projectSlug,
            episodeSlug: item.episodeSlug,
            sourceAssetId: item.sourceAssetId,
            sourcePath: item.sourcePath
        )
        let sourceURL = URL(fileURLWithPath: item.sourcePath)

        if sourceURL.standardizedFileURL.path != destinationURL.standardizedFileURL.path {
            try FileManager.default.createDirectory(at: destinationURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
            }
        }

        let changedClips = try relinkLocalEpisodeSessionSource(item: item, vaultedPath: destinationURL.path)
        var updated = item
        updated.sourcePath = destinationURL.path
        return .success(updated, "Vaulted \(item.displayName) and relinked \(changedClips) decision\(changedClips == 1 ? "" : "s") to the external source-originals path.")
    } catch {
        return .failure("Could not vault \(item.displayName): \(error.localizedDescription)")
    }
}

private func relinkLocalEpisodeSessionToProxy(item: SourceProxyQueueItem) throws -> Int {
    let url = localEpisodeSessionURL(projectSlug: item.projectSlug, episodeSlug: item.episodeSlug)
    let decoder = JSONDecoder()
    var session = try decoder.decode(LocalEpisodeEditSession.self, from: Data(contentsOf: url))
    var changed = 0

    for index in session.editDecisions.indices {
        let playback = cleanPath(session.editDecisions[index].playbackMediaPath)
        let local = cleanPath(session.editDecisions[index].localMediaPath)
        guard playback == item.sourcePath || local == item.sourcePath else { continue }

        if local.isEmpty || local.hasSuffix(".proxy.mp4") {
            session.editDecisions[index].localMediaPath = item.sourcePath
        }
        session.editDecisions[index].playbackMediaPath = item.proxyPath
        session.editDecisions[index].mediaExists = true
        changed += 1
    }

    guard changed > 0 else { return 0 }

    let backupURL = url.deletingLastPathComponent().appendingPathComponent("\(url.lastPathComponent).backup-before-source-proxy-\(Date().ISO8601Format().replacingOccurrences(of: ":", with: "-"))")
    try FileManager.default.copyItem(at: url, to: backupURL)
    session.updatedAt = Date().ISO8601Format()

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try encoder.encode(session).write(to: url, options: .atomic)
    return changed
}

private func relinkLocalEpisodeSessionSource(item: SourceProxyQueueItem, vaultedPath: String) throws -> Int {
    let url = localEpisodeSessionURL(projectSlug: item.projectSlug, episodeSlug: item.episodeSlug)
    let decoder = JSONDecoder()
    var session = try decoder.decode(LocalEpisodeEditSession.self, from: Data(contentsOf: url))
    var changed = 0

    for index in session.editDecisions.indices {
        let playback = cleanPath(session.editDecisions[index].playbackMediaPath)
        let local = cleanPath(session.editDecisions[index].localMediaPath)
        guard playback == item.sourcePath || local == item.sourcePath else { continue }

        session.editDecisions[index].localMediaPath = vaultedPath
        if playback == item.sourcePath {
            session.editDecisions[index].playbackMediaPath = vaultedPath
        }
        session.editDecisions[index].mediaExists = true
        changed += 1
    }

    guard changed > 0 else { return 0 }

    let backupURL = url.deletingLastPathComponent().appendingPathComponent("\(url.lastPathComponent).backup-before-source-vault-\(Date().ISO8601Format().replacingOccurrences(of: ":", with: "-"))")
    try FileManager.default.copyItem(at: url, to: backupURL)
    session.updatedAt = Date().ISO8601Format()

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try encoder.encode(session).write(to: url, options: .atomic)
    return changed
}

private func localEpisodeSessionURL(projectSlug: String, episodeSlug: String) -> URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        .appendingPathComponent("QuipslyMac", isDirectory: true)
        .appendingPathComponent("local-episode-edits", isDirectory: true)
        .appendingPathComponent(safePathComponent(projectSlug), isDirectory: true)
        .appendingPathComponent("\(safePathComponent(episodeSlug)).json", isDirectory: false)
}

private func sourceOriginalURL(workspacePath: String, projectSlug: String, episodeSlug: String, sourceAssetId: String, sourcePath: String) -> URL {
    QuipslyMediaWorkspace.episodeSourceOriginalsURL(rootPath: workspacePath, projectSlug: projectSlug, episodeSlug: episodeSlug)
        .appendingPathComponent(safePathComponent(sourceAssetId), isDirectory: true)
        .appendingPathComponent(safePathComponent(URL(fileURLWithPath: sourcePath).lastPathComponent), isDirectory: false)
}

private func proxyURL(workspacePath: String, projectSlug: String, episodeSlug: String, sourceAssetId: String, sourcePath: String) -> URL {
    let sourceURL = URL(fileURLWithPath: sourcePath)
    let stem = safePathComponent(sourceURL.deletingPathExtension().lastPathComponent)
    return QuipslyMediaWorkspace.episodeProxyCacheURL(rootPath: workspacePath, projectSlug: projectSlug, episodeSlug: episodeSlug)
        .appendingPathComponent(safePathComponent(sourceAssetId), isDirectory: true)
        .appendingPathComponent("\(stem).proxy.mp4", isDirectory: false)
}

private func fileFootprint(path: String) -> FileFootprint {
    guard !path.isEmpty else {
        return FileFootprint(exists: false, logicalBytes: 0, allocatedBytes: 0, isSymlink: false, symlinkTarget: nil, resolvedPath: nil, pathLooksCloudBacked: false)
    }

    var linkStat = stat()
    let lstatResult = path.withCString { lstat($0, &linkStat) }
    guard lstatResult == 0 else {
        return FileFootprint(exists: false, logicalBytes: 0, allocatedBytes: 0, isSymlink: false, symlinkTarget: nil, resolvedPath: nil, pathLooksCloudBacked: pathLooksCloudBacked(path))
    }

    let isSymlink = (linkStat.st_mode & S_IFMT) == S_IFLNK
    let symlinkTarget = isSymlink ? resolvedSymlinkTarget(path: path) : nil
    let statsPath = symlinkTarget ?? path
    var followedStat = stat()
    let statResult = statsPath.withCString { stat($0, &followedStat) }

    guard statResult == 0 else {
        return FileFootprint(exists: false, logicalBytes: 0, allocatedBytes: 0, isSymlink: isSymlink, symlinkTarget: symlinkTarget, resolvedPath: symlinkTarget, pathLooksCloudBacked: pathLooksCloudBacked(path) || pathLooksCloudBacked(symlinkTarget ?? ""))
    }

    return FileFootprint(
        exists: true,
        logicalBytes: Int64(followedStat.st_size),
        allocatedBytes: Int64(followedStat.st_blocks) * 512,
        isSymlink: isSymlink,
        symlinkTarget: symlinkTarget,
        resolvedPath: statsPath,
        pathLooksCloudBacked: pathLooksCloudBacked(path) || pathLooksCloudBacked(statsPath)
    )
}

private func resolvedSymlinkTarget(path: String) -> String? {
    guard let rawTarget = try? FileManager.default.destinationOfSymbolicLink(atPath: path) else { return nil }
    if rawTarget.hasPrefix("/") { return rawTarget }
    return URL(fileURLWithPath: path).deletingLastPathComponent().appendingPathComponent(rawTarget).standardizedFileURL.path
}

private func pathLooksCloudBacked(_ path: String) -> Bool {
    let lower = path.lowercased()
    return lower.contains("/cloudstorage/")
        || lower.contains("googledrive")
        || lower.contains("google drive")
        || lower.contains("/mobile documents/")
        || lower.contains("icloud")
}

private func acquireProxyWorkspaceLock(workspacePath: String) throws -> () -> Void {
    let lockURL = proxyWorkspaceLockURL(workspacePath: workspacePath)
    let lockDirectory = lockURL.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: lockDirectory, withIntermediateDirectories: true)
    let fd = open(lockURL.path, O_CREAT | O_EXCL | O_WRONLY, S_IRUSR | S_IWUSR)
    guard fd >= 0 else {
        throw NSError(domain: "QuipslySourceProxyQueue", code: 1, userInfo: [NSLocalizedDescriptionKey: "Another proxy job appears to be running. Lock: \(lockURL.path)"])
    }

    let details = "pid=\(ProcessInfo.processInfo.processIdentifier) startedAt=\(Date().ISO8601Format())\n"
    _ = details.withCString { write(fd, $0, strlen($0)) }
    close(fd)

    return {
        try? FileManager.default.removeItem(at: lockURL)
    }
}

private func proxyWorkspaceLockURL(workspacePath: String) -> URL {
    QuipslyMediaWorkspace.rootURL(rootPath: workspacePath)
        .appendingPathComponent("locks", isDirectory: true)
        .appendingPathComponent("premiere-cache-external-proxy.lock", isDirectory: false)
}

private func reveal(path: String) {
    let url = URL(fileURLWithPath: path)
    if FileManager.default.fileExists(atPath: url.path) {
        NSWorkspace.shared.activateFileViewerSelecting([url])
    } else {
        NSWorkspace.shared.activateFileViewerSelecting([url.deletingLastPathComponent()])
    }
}

private func stateSort(_ state: SourceHydrationState) -> Int {
    switch state {
    case .missing: 0
    case .cloudLinked: 1
    case .partialLocal: 2
    case .unknown: 3
    case .localReady: 4
    case .proxyOnly: 5
    }
}

private func cleanPath(_ path: String?) -> String {
    (path ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
}

private func ffmpegPath() -> String {
    ProcessInfo.processInfo.environment["FFMPEG_PATH"] ?? "/opt/homebrew/bin/ffmpeg"
}

private func proxyHeight() -> String {
    ProcessInfo.processInfo.environment["QUIPSLY_PROXY_HEIGHT"] ?? "540"
}

private func proxyVideoCodec() -> String {
    ProcessInfo.processInfo.environment["QUIPSLY_PROXY_VIDEO_CODEC"] ?? "libx264"
}

private func proxyPreset() -> String {
    ProcessInfo.processInfo.environment["QUIPSLY_PROXY_PRESET"] ?? "ultrafast"
}

private func proxyCRF() -> String {
    ProcessInfo.processInfo.environment["QUIPSLY_PROXY_CRF"] ?? "34"
}

private func proxyAudioBitrate() -> String {
    ProcessInfo.processInfo.environment["QUIPSLY_PROXY_AUDIO_BITRATE"] ?? "96k"
}

private func safePathComponent(_ value: String) -> String {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
    let dash = UnicodeScalar("-")
    let scalars = String.UnicodeScalarView(value.unicodeScalars.map { scalar in
        allowed.contains(scalar) ? scalar : dash
    })
    let sanitized = String(scalars)
        .replacingOccurrences(of: "--+", with: "-", options: .regularExpression)
        .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    return sanitized.isEmpty ? "untitled" : sanitized
}
