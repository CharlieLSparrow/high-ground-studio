import Foundation

enum QuipslyMediaWorkspace {
    private static let appSupportFolderName = "QuipslyMac"

    static var defaultRootURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent(appSupportFolderName, isDirectory: true)
    }

    static var preferredExternalRootURL: URL {
        URL(fileURLWithPath: "/Volumes/My Passport", isDirectory: true)
            .appendingPathComponent("Quipsly Media Workspace", isDirectory: true)
    }

    static var preferredExternalRootIsAvailable: Bool {
        FileManager.default.fileExists(atPath: preferredExternalRootURL.deletingLastPathComponent().path)
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

    static func ensureRoot(rootPath: String?) throws -> URL {
        let url = rootURL(rootPath: rootPath)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
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
