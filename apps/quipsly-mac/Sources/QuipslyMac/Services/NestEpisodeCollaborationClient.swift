import AppKit
import Foundation

@MainActor
final class NestEpisodeCollaborationClient: ObservableObject {
    @Published var state = EpisodeCollaborationState.empty
    @Published var status = "Not loaded"
    @Published var errorMessage: String?
    @Published var copiedMessage: String?
    @Published var assetDownloadMessages: [String: String] = [:]
    @Published var localAssetAvailability: [String: EpisodeLocalAssetAvailability] = [:]

    func load(baseURL: String, projectSlug: String, episodeSlug: String) async {
        guard let url = endpoint(baseURL: baseURL, projectSlug: projectSlug, episodeSlug: episodeSlug) else {
            status = "Needs attention"
            errorMessage = "Nest URL is not valid."
            return
        }

        status = "Loading collaboration state"
        errorMessage = nil

        do {
            let request = await NestCookieBridge.addingCookies(to: URLRequest(url: url))
            let (data, response) = try await URLSession.shared.data(for: request)
            try handleHTTP(response: response, data: data)
            state = try JSONDecoder().decode(EpisodeCollaborationState.self, from: data)
            status = "Ready"
        } catch {
            status = "Needs login or access"
            errorMessage = error.localizedDescription
        }
    }

    func heartbeat(baseURL: String, projectSlug: String, episodeSlug: String, editing: Bool = false) async {
        await send(
            baseURL: baseURL,
            payload: [
                "action": "heartbeat",
                "projectSlug": projectSlug,
                "episodeSlug": episodeSlug,
                "app": "quipsly-mac",
                "route": "episode-sync",
                "editing": editing,
            ],
            successStatus: editing ? "Marked active and editing" : "Marked active"
        )
    }

    func claimEditLease(baseURL: String, projectSlug: String, episodeSlug: String) async {
        await send(
            baseURL: baseURL,
            payload: [
                "action": "claim-edit-lease",
                "projectSlug": projectSlug,
                "episodeSlug": episodeSlug,
                "app": "quipsly-mac",
            ],
            successStatus: "Edit focus claimed"
        )
    }

    func releaseEditLease(baseURL: String, projectSlug: String, episodeSlug: String) async {
        await send(
            baseURL: baseURL,
            payload: [
                "action": "release-edit-lease",
                "projectSlug": projectSlug,
                "episodeSlug": episodeSlug,
                "app": "quipsly-mac",
            ],
            successStatus: "Edit focus released"
        )
    }

    func copyDiagnostics() {
        guard let data = try? JSONEncoder().encode(PrintableEpisodeCollaborationState(state: state)),
              let string = String(data: data, encoding: .utf8)
        else {
            copiedMessage = "Could not copy diagnostics."
            return
        }

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(string, forType: .string)
        copiedMessage = "Copied collaboration diagnostics."
    }

    func copyMakoHandoffNote(baseURL: String, projectSlug: String, episodeSlug: String) {
        let safeBaseURL = safeBaseURL(baseURL)
        let editorURL = "\(safeBaseURL)/editor?project=\(projectSlug)&episode=\(episodeSlug)"
        let syncSummary = state.ok
            ? "\(state.timelineClipCount ?? 0) timeline clip(s), \(state.assetManifest?.totalAssets ?? 0) needed asset(s)."
            : "Open Episode Sync and click Refresh after signing in."
        let activeSummary = state.activeCollaborators.isEmpty
            ? "No active editors reported yet."
            : "Active now: \(state.activeCollaborators.map { $0.name }.joined(separator: ", "))."
        let focusSummary = state.editLease.map { "Edit focus is currently held by \($0.name)." } ?? "No edit focus is currently claimed."

        let note = """
        Quipsly episode handoff

        1. Open Quipsly Mac.
        2. Go to Nest Session and sign in if needed.
        3. Go to Episode Sync.
        4. Use:
           Project/Nest: \(projectSlug)
           Episode: \(episodeSlug)
        5. Click Refresh, then Download any assets marked Missing locally.
        6. Click Open Episode Editor.

        Browser fallback:
        \(editorURL)

        Current Nest state:
        \(syncSummary)
        \(activeSummary)
        \(focusSummary)

        Editing rule:
        Claim edit focus when doing timeline surgery. It is a friendly hand-raise, not a lock. If Nest has a newer cut while you have unsaved local changes, Quipsly warns instead of overwriting you.
        """

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(note, forType: .string)
        copiedMessage = "Copied Mako handoff note."
    }

    func refreshLocalAssetAvailability(projectSlug: String, episodeSlug: String) {
        var next: [String: EpisodeLocalAssetAvailability] = [:]

        for asset in state.assetManifest?.assets ?? [] {
            next[asset.id] = localAvailability(for: asset, projectSlug: projectSlug, episodeSlug: episodeSlug)
        }

        localAssetAvailability = next
    }

    func downloadAsset(_ asset: EpisodeCollaborationAsset, projectSlug: String, episodeSlug: String) async {
        guard let urlString = asset.bestURL, let url = URL(string: urlString) else {
            assetDownloadMessages[asset.id] = "This asset does not have a downloadable source URL yet."
            return
        }

        assetDownloadMessages[asset.id] = "Downloading to the Quipsly Mac cache..."

        do {
            let destinationFolder = try assetCacheFolder(projectSlug: projectSlug, episodeSlug: episodeSlug, assetId: asset.assetId)
            let destination = destinationFolder.appendingPathComponent(safeFileName(asset.name, fallback: "\(asset.assetId).media"))

            var request = URLRequest(url: url)
            request.setValue("application/octet-stream", forHTTPHeaderField: "Accept")
            let authenticatedRequest = await NestCookieBridge.addingCookies(to: request)
            let (temporaryURL, response) = try await URLSession.shared.download(for: authenticatedRequest)

            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard statusCode < 400 else {
                throw NSError(domain: "NestEpisodeCollaboration", code: statusCode, userInfo: [
                    NSLocalizedDescriptionKey: statusCode == 401
                        ? "Nest needs you to sign in before downloading this asset."
                        : "Download returned HTTP \(statusCode)."
                ])
            }

            if FileManager.default.fileExists(atPath: destination.path) {
                let size = fileSize(at: destination) ?? 0
                if size > 0 {
                    assetDownloadMessages[asset.id] = "Already cached at \(destination.path)"
                    refreshLocalAssetAvailability(projectSlug: projectSlug, episodeSlug: episodeSlug)
                    return
                }
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.moveItem(at: temporaryURL, to: destination)

            assetDownloadMessages[asset.id] = "Downloaded to \(destination.path)"
            copiedMessage = "Downloaded \(asset.name)."
            refreshLocalAssetAvailability(projectSlug: projectSlug, episodeSlug: episodeSlug)
        } catch {
            assetDownloadMessages[asset.id] = "Download failed safely: \(error.localizedDescription)"
            refreshLocalAssetAvailability(projectSlug: projectSlug, episodeSlug: episodeSlug)
        }
    }

    func revealAssetCacheFolder(_ asset: EpisodeCollaborationAsset, projectSlug: String, episodeSlug: String) {
        do {
            let folder = try assetCacheFolder(projectSlug: projectSlug, episodeSlug: episodeSlug, assetId: asset.assetId)
            NSWorkspace.shared.activateFileViewerSelecting([folder])
            copiedMessage = "Opened the asset cache folder."
        } catch {
            assetDownloadMessages[asset.id] = "Could not open cache folder: \(error.localizedDescription)"
        }
    }

    func openCachedAsset(_ asset: EpisodeCollaborationAsset, projectSlug: String, episodeSlug: String) {
        guard let url = cachedAssetURL(asset, projectSlug: projectSlug, episodeSlug: episodeSlug) else {
            assetDownloadMessages[asset.id] = "This asset is not cached locally yet."
            return
        }

        NSWorkspace.shared.open(url)
    }

    private func send(baseURL: String, payload: [String: Any], successStatus: String) async {
        guard let url = endpoint(baseURL: baseURL) else {
            status = "Needs attention"
            errorMessage = "Nest URL is not valid."
            return
        }

        status = "Sending"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)

            let authenticatedRequest = await NestCookieBridge.addingCookies(to: request)
            let (data, response) = try await URLSession.shared.data(for: authenticatedRequest)
            try handleHTTP(response: response, data: data)
            state = try JSONDecoder().decode(EpisodeCollaborationState.self, from: data)
            status = successStatus
        } catch {
            status = "Needs login or access"
            errorMessage = error.localizedDescription
        }
    }

    private func endpoint(baseURL: String, projectSlug: String, episodeSlug: String) -> URL? {
        guard var components = URLComponents(string: safeBaseURL(baseURL)) else { return nil }
        components.path = "/api/episode-production/collaboration"
        components.queryItems = [
            URLQueryItem(name: "projectSlug", value: projectSlug.trimmingCharacters(in: .whitespacesAndNewlines)),
            URLQueryItem(name: "episodeSlug", value: episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines)),
        ]
        return components.url
    }

    private func endpoint(baseURL: String) -> URL? {
        guard var components = URLComponents(string: safeBaseURL(baseURL)) else { return nil }
        components.path = "/api/episode-production/collaboration"
        components.queryItems = nil
        return components.url
    }

    private func safeBaseURL(_ baseURL: String) -> String {
        let trimmed = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "https://nest.quipsly.com" : trimmed
    }

    private func assetCacheFolder(projectSlug: String, episodeSlug: String, assetId: String) throws -> URL {
        let appSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let folder = appSupport
            .appendingPathComponent("Quipsly", isDirectory: true)
            .appendingPathComponent("EpisodeAssets", isDirectory: true)
            .appendingPathComponent(safePathComponent(projectSlug), isDirectory: true)
            .appendingPathComponent(safePathComponent(episodeSlug), isDirectory: true)
            .appendingPathComponent(safePathComponent(assetId), isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    private func localAvailability(for asset: EpisodeCollaborationAsset, projectSlug: String, episodeSlug: String) -> EpisodeLocalAssetAvailability {
        do {
            let folder = try assetCacheFolder(projectSlug: projectSlug, episodeSlug: episodeSlug, assetId: asset.assetId)
            let expectedFile = folder.appendingPathComponent(safeFileName(asset.name, fallback: "\(asset.assetId).media"))
            if FileManager.default.fileExists(atPath: expectedFile.path), let size = fileSize(at: expectedFile), size > 0 {
                return EpisodeLocalAssetAvailability(
                    status: .cached,
                    label: "Cached on this Mac",
                    detail: "Ready locally. Mako can open this without re-downloading.",
                    folderPath: folder.path,
                    filePath: expectedFile.path,
                    fileSizeBytes: size
                )
            }

            let folderContents = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.fileSizeKey])) ?? []
            let alternateFile = folderContents.first { url in
                (fileSize(at: url) ?? 0) > 0
            }
            if let alternateFile {
                return EpisodeLocalAssetAvailability(
                    status: .needsRelink,
                    label: "Cached file needs relink",
                    detail: "Something is in this asset cache folder, but not under the expected filename.",
                    folderPath: folder.path,
                    filePath: alternateFile.path,
                    fileSizeBytes: fileSize(at: alternateFile)
                )
            }

            if asset.bestURL == nil {
                return EpisodeLocalAssetAvailability(
                    status: .sourceUnavailable,
                    label: "No source URL yet",
                    detail: "Nest knows the asset, but this Mac does not have a downloadable source for it yet.",
                    folderPath: folder.path,
                    filePath: nil,
                    fileSizeBytes: nil
                )
            }

            return EpisodeLocalAssetAvailability(
                status: .missing,
                label: "Missing locally",
                detail: "Download this asset before relying on local playback or export.",
                folderPath: folder.path,
                filePath: nil,
                fileSizeBytes: nil
            )
        } catch {
            return EpisodeLocalAssetAvailability(
                status: .error,
                label: "Could not check local cache",
                detail: error.localizedDescription,
                folderPath: nil,
                filePath: nil,
                fileSizeBytes: nil
            )
        }
    }

    private func cachedAssetURL(_ asset: EpisodeCollaborationAsset, projectSlug: String, episodeSlug: String) -> URL? {
        guard let availability = localAssetAvailability[asset.id], availability.status == .cached || availability.status == .needsRelink else {
            return nil
        }
        guard let path = availability.filePath else { return nil }
        return URL(fileURLWithPath: path)
    }

    private func fileSize(at url: URL) -> Int64? {
        guard let values = try? url.resourceValues(forKeys: [.fileSizeKey]) else { return nil }
        if let fileSize = values.fileSize {
            return Int64(fileSize)
        }

        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
        return attributes?[.size] as? Int64
    }

    private func safeFileName(_ name: String, fallback: String) -> String {
        let cleaned = name
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: CharacterSet(charactersIn: "/:\\"))
            .joined(separator: "-")
        return cleaned.isEmpty ? fallback : cleaned
    }

    private func safePathComponent(_ value: String) -> String {
        let cleaned = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
            .lowercased()
        return cleaned.isEmpty ? "unknown" : cleaned
    }

    private func handleHTTP(response: URLResponse, data: Data) throws {
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard statusCode < 400 else {
            let decoded = try? JSONDecoder().decode(EpisodeCollaborationState.self, from: data)
            let serverMessage = decoded?.error

            if statusCode == 401 {
                throw NSError(domain: "NestEpisodeCollaboration", code: 401, userInfo: [
                    NSLocalizedDescriptionKey: serverMessage ?? "Nest needs you to sign in before collaboration can sync."
                ])
            }

            if statusCode == 403 {
                throw NSError(domain: "NestEpisodeCollaboration", code: 403, userInfo: [
                    NSLocalizedDescriptionKey: serverMessage ?? "This Nest account does not have access to this episode."
                ])
            }

            throw NSError(domain: "NestEpisodeCollaboration", code: statusCode, userInfo: [
                NSLocalizedDescriptionKey: serverMessage ?? "Nest collaboration returned HTTP \(statusCode)."
            ])
        }
    }
}

private struct PrintableEpisodeCollaborationState: Encodable {
    var ok: Bool
    var projectSlug: String
    var episodeSlug: String
    var productionId: String?
    var title: String?
    var role: String?
    var timelineFingerprint: String?
    var timelineClipCount: Int?
    var activeCollaborators: Int
    var editLeaseName: String?
    var totalAssets: Int
    var assets: [PrintableEpisodeCollaborationAsset]

    init(state: EpisodeCollaborationState) {
        self.ok = state.ok
        self.projectSlug = state.projectSlug
        self.episodeSlug = state.episodeSlug
        self.productionId = state.productionId
        self.title = state.title
        self.role = state.role
        self.timelineFingerprint = state.timelineFingerprint
        self.timelineClipCount = state.timelineClipCount
        self.activeCollaborators = state.activeCollaborators.count
        self.editLeaseName = state.editLease?.name
        self.totalAssets = state.assetManifest?.totalAssets ?? 0
        self.assets = state.assetManifest?.assets.map(PrintableEpisodeCollaborationAsset.init(asset:)) ?? []
    }
}

private struct PrintableEpisodeCollaborationAsset: Encodable {
    var assetId: String
    var clipId: String?
    var name: String
    var kind: String
    var role: String?
    var status: String
    var trackId: String?
    var durationSeconds: Double?
    var hasSourceURL: Bool
    var hasPlaybackURL: Bool
    var gcsUri: String?

    init(asset: EpisodeCollaborationAsset) {
        self.assetId = asset.assetId
        self.clipId = asset.clipId
        self.name = asset.name
        self.kind = asset.kind
        self.role = asset.role
        self.status = asset.status
        self.trackId = asset.trackId
        self.durationSeconds = asset.durationSeconds
        self.hasSourceURL = asset.sourceUrl?.isEmpty == false
        self.hasPlaybackURL = asset.playbackUrl?.isEmpty == false
        self.gcsUri = asset.gcsUri
    }
}
