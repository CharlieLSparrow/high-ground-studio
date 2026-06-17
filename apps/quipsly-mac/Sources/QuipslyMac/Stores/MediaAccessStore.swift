import AppKit
import Foundation

struct MediaAccessRoot: Identifiable, Codable, Equatable {
    var id: String
    var label: String
    var path: String
    var bookmarkData: Data?
    var grantedAt: Date
    var lastAccessedAt: Date?
    var isStale: Bool
    var status: String

    var displayLabel: String {
        label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? URL(fileURLWithPath: path).lastPathComponent
            : label
    }
}

@MainActor
final class MediaAccessStore: ObservableObject {
    @Published private(set) var roots: [MediaAccessRoot] = []
    @Published private(set) var lastMessage = "No media folders granted yet."

    private var activeSecurityScopedURLs: [String: URL] = [:]
    private let fileURL: URL

    init(fileURL: URL = MediaAccessStore.defaultVaultURL()) {
        self.fileURL = fileURL
        load()
        restoreAccessIfNeeded()
    }

    var activeRootCount: Int {
        roots.filter { root in
            root.status == "active"
        }.count
    }

    var needsAttentionCount: Int {
        roots.filter { root in
            root.status != "active"
        }.count
    }

    @discardableResult
    func addRoot(_ url: URL, label explicitLabel: String? = nil) -> Bool {
        let rootURL = normalizedDirectoryURL(from: url)
        let path = rootURL.path
        let label = explicitLabel?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
            ?? rootURL.lastPathComponent.nonEmpty
            ?? path

        do {
            let didAccess = rootURL.startAccessingSecurityScopedResource()
            defer {
                if didAccess {
                    rootURL.stopAccessingSecurityScopedResource()
                }
            }

            let bookmarkData = try rootURL.bookmarkData(
                options: [.withSecurityScope],
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )

            if let existingIndex = roots.firstIndex(where: { $0.path == path }) {
                roots[existingIndex].label = label
                roots[existingIndex].bookmarkData = bookmarkData
                roots[existingIndex].grantedAt = Date()
                roots[existingIndex].lastAccessedAt = Date()
                roots[existingIndex].isStale = false
                roots[existingIndex].status = "active"
            } else {
                roots.append(MediaAccessRoot(
                    id: UUID().uuidString,
                    label: label,
                    path: path,
                    bookmarkData: bookmarkData,
                    grantedAt: Date(),
                    lastAccessedAt: Date(),
                    isStale: false,
                    status: "active"
                ))
            }

            startAccess(forPath: path, url: rootURL)
            save()
            lastMessage = "Saved durable access to \(label)."
            return true
        } catch {
            let root = MediaAccessRoot(
                id: UUID().uuidString,
                label: label,
                path: path,
                bookmarkData: nil,
                grantedAt: Date(),
                lastAccessedAt: nil,
                isStale: true,
                status: "needs regrant: \(error.localizedDescription)"
            )
            replaceOrAppend(root)
            save()
            lastMessage = "Could not save durable access to \(label): \(error.localizedDescription)"
            return false
        }
    }

    func addParentRoot(forFile url: URL) {
        addRoot(url.deletingLastPathComponent(), label: url.deletingLastPathComponent().lastPathComponent)
    }

    func removeRoot(id: String) {
        guard let index = roots.firstIndex(where: { $0.id == id }) else { return }
        let root = roots.remove(at: index)
        stopAccess(forPath: root.path)
        save()
        lastMessage = "Removed media access for \(root.displayLabel)."
    }

    func restoreAccessIfNeeded() {
        guard !roots.isEmpty else {
            lastMessage = "No media folders granted yet."
            return
        }

        var restored = 0
        for root in roots {
            if restoreAccess(for: root) {
                restored += 1
            }
        }

        save()
        lastMessage = restored == roots.count
            ? "Restored access to \(restored) media folder\(restored == 1 ? "" : "s")."
            : "Restored \(restored) of \(roots.count) media folder\(roots.count == 1 ? "" : "s"). Regrant the rest."
    }

    func revealVaultFile() {
        NSWorkspace.shared.activateFileViewerSelecting([fileURL])
    }

    func openFullDiskAccessSettings() {
        let candidates = [
            "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles",
        ]

        for candidate in candidates {
            guard let url = URL(string: candidate) else { continue }
            if NSWorkspace.shared.open(url) {
                lastMessage = "Opened macOS Full Disk Access settings. Add Quipsly Mac there if you want broad access."
                return
            }
        }

        lastMessage = "Could not open Full Disk Access settings automatically. Open System Settings > Privacy & Security > Full Disk Access."
    }

    func testFullDiskAccessProbe() {
        let fileManager = FileManager.default
        let home = fileManager.homeDirectoryForCurrentUser
        let protectedRelativePaths = [
            "Library/Mail",
            "Library/Messages",
            "Library/Safari",
            "Library/Application Support/AddressBook",
        ]

        var checked = 0
        var readable = 0
        var failures: [String] = []

        for relativePath in protectedRelativePaths {
            let url = home.appendingPathComponent(relativePath, isDirectory: true)
            guard fileManager.fileExists(atPath: url.path) else { continue }

            checked += 1
            do {
                _ = try fileManager.contentsOfDirectory(
                    at: url,
                    includingPropertiesForKeys: nil,
                    options: [.skipsHiddenFiles]
                )
                readable += 1
            } catch {
                failures.append("\(URL(fileURLWithPath: relativePath).lastPathComponent): \(error.localizedDescription)")
            }
        }

        if checked == 0 {
            lastMessage = "Full Disk Access probe could not find the standard protected folders on this Mac. Use granted media roots as the reliable source of truth."
        } else if readable == checked {
            lastMessage = "Full Disk Access appears active for Quipsly Mac. Protected-folder metadata checks passed for \(readable) of \(checked) locations."
        } else {
            let failureSummary = failures.prefix(2).joined(separator: " · ")
            lastMessage = "Full Disk Access does not appear active yet. Protected-folder metadata checks passed for \(readable) of \(checked). \(failureSummary)"
        }
    }

    func recordMessage(_ message: String) {
        lastMessage = message
    }

    nonisolated static func persistedRootPaths() -> [String] {
        guard let data = try? Data(contentsOf: defaultVaultURL()),
              let roots = try? JSONDecoder.quipslyMediaAccessDecoder.decode([MediaAccessRoot].self, from: data)
        else {
            return []
        }

        var seen = Set<String>()
        return roots.compactMap { root in
            let path = root.path.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !path.isEmpty, !seen.contains(path) else { return nil }
            seen.insert(path)
            return path
        }
    }

    private func restoreAccess(for root: MediaAccessRoot) -> Bool {
        guard let bookmarkData = root.bookmarkData else {
            markRoot(path: root.path, status: "needs regrant", isStale: true)
            return false
        }

        do {
            var isStale = false
            let url = try URL(
                resolvingBookmarkData: bookmarkData,
                options: [.withSecurityScope],
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            )

            guard FileManager.default.fileExists(atPath: url.path) else {
                markRoot(path: root.path, status: "missing", isStale: true)
                return false
            }

            startAccess(forPath: root.path, url: url)
            markRoot(path: root.path, status: "active", isStale: isStale, resolvedPath: url.path)
            return true
        } catch {
            markRoot(path: root.path, status: "needs regrant: \(error.localizedDescription)", isStale: true)
            return false
        }
    }

    private func startAccess(forPath path: String, url: URL) {
        if activeSecurityScopedURLs[path] == nil {
            _ = url.startAccessingSecurityScopedResource()
            activeSecurityScopedURLs[path] = url
        }
    }

    private func stopAccess(forPath path: String) {
        if let url = activeSecurityScopedURLs.removeValue(forKey: path) {
            url.stopAccessingSecurityScopedResource()
        }
    }

    private func markRoot(path: String, status: String, isStale: Bool, resolvedPath: String? = nil) {
        guard let index = roots.firstIndex(where: { $0.path == path }) else { return }
        roots[index].status = status
        roots[index].isStale = isStale
        roots[index].lastAccessedAt = status == "active" ? Date() : roots[index].lastAccessedAt
        if let resolvedPath, resolvedPath != path {
            roots[index].path = resolvedPath
        }
    }

    private func replaceOrAppend(_ root: MediaAccessRoot) {
        if let index = roots.firstIndex(where: { $0.path == root.path }) {
            roots[index] = root
        } else {
            roots.append(root)
        }
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder.quipslyMediaAccessDecoder.decode([MediaAccessRoot].self, from: data)
        else {
            roots = []
            return
        }

        roots = decoded
    }

    private func save() {
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONEncoder.quipslyMediaAccessEncoder.encode(roots)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            lastMessage = "Could not save media access vault: \(error.localizedDescription)"
        }
    }

    private func normalizedDirectoryURL(from url: URL) -> URL {
        var isDirectory: ObjCBool = false
        if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), !isDirectory.boolValue {
            return url.deletingLastPathComponent()
        }

        return url
    }

    nonisolated private static func defaultVaultURL() -> URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("QuipslyMac", isDirectory: true)
            .appendingPathComponent("media-access-roots.json")
    }
}

private extension JSONEncoder {
    static var quipslyMediaAccessEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private extension JSONDecoder {
    static var quipslyMediaAccessDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}
