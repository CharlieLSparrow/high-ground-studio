import Foundation

enum QuipslyMediaWorkspace {
    private static let appSupportFolderName = "QuipslyMac"
    private static let sharedWorkspaceSchema = "quipsly-local-media-workspace-v1"

    private struct SharedWorkspaceConfiguration: Codable {
        let schema: String
        let status: String
        let workspaceRoot: String
        let workerMediaRoot: String
        let spatialVaultRoot: String
        let legacyReadRoots: [String]
        let revision: Int
        let updatedAt: String
        let activationReceiptSha256: String?
    }

    static var defaultRootURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent(appSupportFolderName, isDirectory: true)
    }

    static var sharedConfigurationURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("Quipsly", isDirectory: true)
            .appendingPathComponent("local-media-workspace.json", isDirectory: false)
    }

    static func normalizedRootPath(_ path: String?) -> String {
        let trimmed = (path ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return defaultRootURL.standardizedFileURL.path
        }

        let expanded = NSString(string: trimmed).expandingTildeInPath
        return URL(fileURLWithPath: expanded).standardizedFileURL.path
    }

    static func rootURL(rootPath: String?) -> URL {
        URL(fileURLWithPath: normalizedRootPath(rootPath), isDirectory: true)
    }

    static func isDefaultRootPath(_ path: String?) -> Bool {
        normalizedRootPath(path) == defaultRootURL.standardizedFileURL.path
    }

    static func playbackCacheRootURL(rootPath: String?) -> URL {
        rootURL(rootPath: rootPath)
            .appendingPathComponent("playback-cache", isDirectory: true)
    }

    static func episodePlaybackCacheURL(rootPath: String?, projectSlug: String, episodeSlug: String) -> URL {
        playbackCacheRootURL(rootPath: rootPath)
            .appendingPathComponent(safePathComponent(projectSlug), isDirectory: true)
            .appendingPathComponent(safePathComponent(episodeSlug), isDirectory: true)
    }

    static func proxyCacheRootURL(rootPath: String?) -> URL {
        rootURL(rootPath: rootPath)
            .appendingPathComponent("media-cache", isDirectory: true)
            .appendingPathComponent("proxies", isDirectory: true)
    }

    static func episodeProxyCacheURL(rootPath: String?, projectSlug: String, episodeSlug: String) -> URL {
        proxyCacheRootURL(rootPath: rootPath)
            .appendingPathComponent(safePathComponent(projectSlug), isDirectory: true)
            .appendingPathComponent(safePathComponent(episodeSlug), isDirectory: true)
    }

    static func sourceOriginalsRootURL(rootPath: String?) -> URL {
        rootURL(rootPath: rootPath)
            .appendingPathComponent("source-originals", isDirectory: true)
    }

    static func episodeSourceOriginalsURL(rootPath: String?, projectSlug: String, episodeSlug: String) -> URL {
        sourceOriginalsRootURL(rootPath: rootPath)
            .appendingPathComponent(safePathComponent(projectSlug), isDirectory: true)
            .appendingPathComponent(safePathComponent(episodeSlug), isDirectory: true)
    }

    static func sourceOriginalURL(rootPath: String?, projectSlug: String, episodeSlug: String, sourceGroupID: String, fileName: String) -> URL {
        episodeSourceOriginalsURL(rootPath: rootPath, projectSlug: projectSlug, episodeSlug: episodeSlug)
            .appendingPathComponent(safePathComponent(sourceGroupID), isDirectory: true)
            .appendingPathComponent(safeFileName(fileName), isDirectory: false)
    }

    static func renderOutputRootURL(rootPath: String?) -> URL {
        rootURL(rootPath: rootPath)
            .appendingPathComponent("renders", isDirectory: true)
    }

    static func renderOutputURL(rootPath: String?, projectSlug: String, episodeSlug: String) -> URL {
        renderOutputRootURL(rootPath: rootPath)
            .appendingPathComponent(safePathComponent(projectSlug), isDirectory: true)
            .appendingPathComponent(safePathComponent(episodeSlug), isDirectory: true)
    }

    static func availableBytes(at rootURL: URL) -> Int64? {
        let fileManager = FileManager.default
        let readableURL: URL

        if fileManager.fileExists(atPath: rootURL.path) {
            readableURL = rootURL
        } else {
            let parentURL = rootURL.deletingLastPathComponent()
            readableURL = fileManager.fileExists(atPath: parentURL.path) ? parentURL : fileManager.homeDirectoryForCurrentUser
        }

        let values = try? readableURL.resourceValues(forKeys: [
            .volumeAvailableCapacityForImportantUsageKey,
            .volumeAvailableCapacityForOpportunisticUsageKey,
            .volumeAvailableCapacityKey,
        ])

        let candidates: [Int64] = [
            values?.volumeAvailableCapacityForImportantUsage,
            values?.volumeAvailableCapacityForOpportunisticUsage,
            values?.volumeAvailableCapacity.map(Int64.init),
        ].compactMap { $0 }

        return candidates.max()
    }

    static func availableLabel(at rootURL: URL) -> String {
        availableBytes(at: rootURL)
            .map { ByteCountFormatter.string(fromByteCount: $0, countStyle: .file) } ?? "unknown space"
    }

    static func capacityGuidance(at rootURL: URL) -> String {
        guard let available = availableBytes(at: rootURL) else {
            return "Capacity could not be verified. Quipsly will not activate workers here until migration verifies the volume."
        }
        let formatted = ByteCountFormatter.string(fromByteCount: available, countStyle: .file)
        if available < 100 * 1_024 * 1_024 * 1_024 {
            return "Only \(formatted) is available. Choose a volume with at least 100 GB free for 4K and 360° work."
        }
        return "\(formatted) is available. Exact migration still verifies every source and preserves the old bytes."
    }

    static func sharedWorkspaceStatus(
        rootPath: String?,
        configurationURL: URL = sharedConfigurationURL
    ) -> String {
        guard let configuration = try? readSharedConfiguration(at: configurationURL) else {
            return "Not planned for durable workers"
        }
        guard configuration.workspaceRoot == normalizedRootPath(rootPath) else {
            return configuration.status == "active"
                ? "Another workspace is active"
                : "Another workspace is planned"
        }
        return configuration.status == "active"
            ? "Active and checksum verified"
            : "Planned — migration required before activation"
    }

    @discardableResult
    static func planSharedWorkspace(
        rootPath: String?,
        configurationURL: URL = sharedConfigurationURL
    ) throws -> String {
        let workspace = rootURL(rootPath: rootPath).standardizedFileURL
        try validateDedicatedRoot(workspace)
        let worker = workspace.appendingPathComponent("worker-media", isDirectory: true)
        let spatial = workspace.appendingPathComponent("spatial-vault", isDirectory: true)
        try FileManager.default.createDirectory(at: worker, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: spatial, withIntermediateDirectories: true)

        let prior = try? readSharedConfiguration(at: configurationURL)
        if prior?.status == "active", prior?.workspaceRoot == workspace.path {
            return "This workspace is already active and checksum verified."
        }
        var legacyRoots = prior?.legacyReadRoots ?? []
        if prior?.status == "active", let priorWorker = prior?.workerMediaRoot, priorWorker != worker.path {
            legacyRoots.insert(priorWorker, at: 0)
        }
        legacyRoots = Array(NSOrderedSet(array: legacyRoots).compactMap { $0 as? String }.prefix(8))
        let configuration = SharedWorkspaceConfiguration(
            schema: sharedWorkspaceSchema,
            status: "planned",
            workspaceRoot: workspace.path,
            workerMediaRoot: worker.path,
            spatialVaultRoot: spatial.path,
            legacyReadRoots: legacyRoots,
            revision: (prior?.revision ?? 0) + 1,
            updatedAt: ISO8601DateFormatter().string(from: .now),
            activationReceiptSha256: nil
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(configuration)
        try FileManager.default.createDirectory(
            at: configurationURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try data.write(to: configurationURL, options: .atomic)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: configurationURL.path
        )
        return "Workspace planned. Mac editing can use it now; durable workers stay unchanged until exact-byte migration succeeds."
    }

    static func ensureRoot(rootPath: String?) throws -> URL {
        let url = rootURL(rootPath: rootPath)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private static func readSharedConfiguration(at configurationURL: URL) throws -> SharedWorkspaceConfiguration {
        let data = try Data(contentsOf: configurationURL)
        let configuration = try JSONDecoder().decode(SharedWorkspaceConfiguration.self, from: data)
        guard configuration.schema == sharedWorkspaceSchema,
              ["planned", "active"].contains(configuration.status),
              configuration.revision > 0,
              configuration.legacyReadRoots.count <= 8,
              configuration.legacyReadRoots.allSatisfy({
                  NSString(string: $0).isAbsolutePath
                      && !pathsOverlap($0, configuration.workspaceRoot)
              }),
              configuration.status != "active"
              || configuration.activationReceiptSha256?.range(
                  of: "^[a-f0-9]{64}$",
                  options: .regularExpression
              ) != nil,
              configuration.workerMediaRoot == URL(fileURLWithPath: configuration.workspaceRoot)
              .appendingPathComponent("worker-media", isDirectory: true).path,
              configuration.spatialVaultRoot == URL(fileURLWithPath: configuration.workspaceRoot)
              .appendingPathComponent("spatial-vault", isDirectory: true).path
        else {
            throw CocoaError(.fileReadCorruptFile)
        }
        return configuration
    }

    private static func pathsOverlap(_ first: String, _ second: String) -> Bool {
        let firstPath = URL(fileURLWithPath: first).standardizedFileURL.path
        let secondPath = URL(fileURLWithPath: second).standardizedFileURL.path
        return firstPath == secondPath
            || firstPath.hasPrefix(secondPath + "/")
            || secondPath.hasPrefix(firstPath + "/")
    }

    private static func validateDedicatedRoot(_ url: URL) throws {
        let path = url.path
        let forbidden = ["/", "/Volumes", "/Users", FileManager.default.homeDirectoryForCurrentUser.path]
        guard url.isFileURL, url.pathComponents.count > 2, !forbidden.contains(path) else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
    }

    private static func safePathComponent(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        let dash = UnicodeScalar("-")
        let scalars = String.UnicodeScalarView(value.unicodeScalars.map { scalar in
            allowed.contains(scalar) ? scalar : dash
        })
        let sanitized = String(scalars)
            .replacingOccurrences(of: "--+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return sanitized.isEmpty ? "untitled" : sanitized
    }

    private static func safeFileName(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "media" }

        let url = URL(fileURLWithPath: trimmed)
        let ext = url.pathExtension
        let stem = url.deletingPathExtension().lastPathComponent
        let safeStem = safePathComponent(stem)
        return ext.isEmpty ? safeStem : "\(safeStem).\(safePathComponent(ext))"
    }
}
