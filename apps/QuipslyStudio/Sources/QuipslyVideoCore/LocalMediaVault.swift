import Foundation

public enum LocalMediaVaultError: Error, LocalizedError {
    case missingSource(URL)
    case couldNotCreateDirectory(URL)
    case copyFailed(source: URL, destination: URL, underlying: Error)
    case sessionNotFound(String)

    public var errorDescription: String? {
        switch self {
        case .missingSource(let url):
            return "Source file is not available locally: \(url.path)"
        case .couldNotCreateDirectory(let url):
            return "Could not create Quipsly media vault directory: \(url.path)"
        case .copyFailed(let source, let destination, let underlying):
            return "Could not copy \(source.lastPathComponent) into the media vault at \(destination.path): \(underlying.localizedDescription)"
        case .sessionNotFound(let name):
            return "No native editor session found named \(name)."
        }
    }
}

public actor LocalMediaVault {
    public static let shared = LocalMediaVault()

    public let rootURL: URL

    public init(rootURL: URL? = nil) {
        if let rootURL {
            self.rootURL = rootURL
            return
        }

        if let configured = ProcessInfo.processInfo.environment["QUIPSLY_MEDIA_VAULT"], !configured.isEmpty {
            self.rootURL = URL(fileURLWithPath: configured, isDirectory: true)
            return
        }

        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        self.rootURL = appSupport
            .appendingPathComponent("Quipsly", isDirectory: true)
            .appendingPathComponent("MediaVault", isDirectory: true)
    }

    public nonisolated var rawRootURL: URL {
        rootURL.appendingPathComponent("raw", isDirectory: true)
    }

    public nonisolated var proxyRootURL: URL {
        rootURL.appendingPathComponent("proxy", isDirectory: true)
    }

    public nonisolated var sessionRootURL: URL {
        rootURL.appendingPathComponent("sessions", isDirectory: true)
    }

    public func state() throws -> [String: String] {
        try ensureDirectories()
        return [
            "root": rootURL.path,
            "raw": rawRootURL.path,
            "proxy": proxyRootURL.path,
            "sessions": sessionRootURL.path
        ]
    }

    public func listSessions() throws -> [[String: String]] {
        try ensureDirectories()

        let sessionURLs = try FileManager.default.contentsOfDirectory(
            at: sessionRootURL,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        )
        .filter { $0.pathExtension == "json" && $0.lastPathComponent.hasSuffix(".quipsly-session.json") }

        let formatter = ISO8601DateFormatter()

        return sessionURLs
            .map { url -> (url: URL, modifiedAt: Date, payload: [String: String]) in
                let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
                let modifiedAt = values?.contentModificationDate ?? Date.distantPast
                let size = values?.fileSize ?? 0
                let name = url.lastPathComponent.replacingOccurrences(of: ".quipsly-session.json", with: "")
                return (
                    url,
                    modifiedAt,
                    [
                        "name": name,
                        "path": url.path,
                        "modifiedAt": formatter.string(from: modifiedAt),
                        "sizeBytes": "\(size)"
                    ]
                )
            }
            .sorted { $0.modifiedAt > $1.modifiedAt }
            .map(\.payload)
    }

    public nonisolated func assetFingerprint(for url: URL) -> String {
        let standardized = url.standardizedFileURL.path
        return Self.fnv1a64Hex(standardized)
    }

    public nonisolated func rawURL(for sourceURL: URL) throws -> URL {
        let assetId = assetFingerprint(for: sourceURL)
        let folder = rawRootURL.appendingPathComponent(assetId, isDirectory: true)
        return folder.appendingPathComponent(safeFilename(sourceURL.lastPathComponent))
    }

    public nonisolated func proxyURL(for sourceURL: URL) throws -> URL {
        let assetId = assetFingerprint(for: sourceURL)
        let basename = sourceURL.deletingPathExtension().lastPathComponent
        let safeBase = safeFilename(basename.isEmpty ? assetId : basename)
        let proxyExtension = Self.isAudioExtension(sourceURL.pathExtension) ? "m4a" : "mp4"
        let folder = proxyRootURL.appendingPathComponent(assetId, isDirectory: true)
        return folder.appendingPathComponent("\(safeBase)_proxy.\(proxyExtension)")
    }

    public nonisolated static func isAudioExtension(_ value: String) -> Bool {
        let ext = value.lowercased()
        return ["wav", "aif", "aiff", "mp3", "m4a", "aac", "flac"].contains(ext)
    }

    public func importRawFile(from sourceURL: URL) throws -> URL {
        try ensureDirectories()

        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
            throw LocalMediaVaultError.missingSource(sourceURL)
        }

        let destination = try rawURL(for: sourceURL)
        try createDirectoryIfNeeded(destination.deletingLastPathComponent())

        if FileManager.default.fileExists(atPath: destination.path) {
            return destination
        }

        do {
            try FileManager.default.copyItem(at: sourceURL, to: destination)
            return destination
        } catch {
            throw LocalMediaVaultError.copyFailed(source: sourceURL, destination: destination, underlying: error)
        }
    }

    public func saveSession(_ session: NativeEditorSession, named name: String) throws -> URL {
        try ensureDirectories()
        let url = sessionURL(named: name)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(session)
        try data.write(to: url, options: [.atomic])
        return url
    }

    public func loadSession(named name: String) throws -> NativeEditorSession {
        try ensureDirectories()
        let url = sessionURL(named: name)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw LocalMediaVaultError.sessionNotFound(name)
        }

        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(NativeEditorSession.self, from: data)
    }

    public nonisolated func sessionURL(named name: String) -> URL {
        sessionRootURL.appendingPathComponent("\(safeFilename(name)).quipsly-session.json")
    }

    private func ensureDirectories() throws {
        try createDirectoryIfNeeded(rootURL)
        try createDirectoryIfNeeded(rawRootURL)
        try createDirectoryIfNeeded(proxyRootURL)
        try createDirectoryIfNeeded(sessionRootURL)
    }

    private func createDirectoryIfNeeded(_ url: URL) throws {
        if FileManager.default.fileExists(atPath: url.path) {
            return
        }

        do {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        } catch {
            throw LocalMediaVaultError.couldNotCreateDirectory(url)
        }
    }

    private nonisolated func safeFilename(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._- "))
        let scalars = value.unicodeScalars.map { scalar in
            allowed.contains(scalar) ? Character(scalar) : "-"
        }
        let sanitized = String(scalars)
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "__", with: "_")
        return sanitized.isEmpty ? "asset" : sanitized
    }

    private static func fnv1a64Hex(_ input: String) -> String {
        var hash: UInt64 = 0xcbf29ce484222325
        let prime: UInt64 = 0x100000001b3
        for byte in input.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* prime
        }
        return String(format: "%016llx", hash)
    }
}
