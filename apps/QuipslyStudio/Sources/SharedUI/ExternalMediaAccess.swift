import Foundation
#if canImport(Combine)
import Combine
#endif

@MainActor
public final class ExternalMediaAccess: ObservableObject {
    public static let shared = ExternalMediaAccess()

    private let bookmarkKey = "quipsly.nativeEditor.externalMediaRootBookmark"
    private let pathKey = "quipsly.nativeEditor.externalMediaRootPath"
    private let grantedAtKey = "quipsly.nativeEditor.externalMediaRootGrantedAt"

    @Published public private(set) var rootPath: String
    @Published public private(set) var status: String
    @Published public private(set) var hasActiveAccess: Bool = false
    @Published public private(set) var hasExplicitProtectedOriginalAccess: Bool = false

    private var activeURL: URL?

    public var hasExplicitFolderGrant: Bool {
        hasExplicitProtectedOriginalAccess && hasActiveAccess && !rootPath.isEmpty
    }

    public var protectedOriginalAccessRootPath: String? {
        hasExplicitFolderGrant ? rootPath : nil
    }

    public init() {
        let savedRootPath = UserDefaults.standard.string(forKey: pathKey) ?? ""
        self.rootPath = savedRootPath
        if savedRootPath.isEmpty, Self.hasDirectFilesystemAccess {
            self.status = "This local Quipsly Studio build can read normal media paths directly. No folder grant is needed unless macOS blocks a protected location."
            self.hasActiveAccess = true
            self.hasExplicitProtectedOriginalAccess = false
        } else if savedRootPath.isEmpty {
            self.status = "No external media folder has been granted yet."
        } else {
            self.status = "External media folder remembered. Restoring access."
            restoreAccess()
        }
    }

    public var displayName: String {
        guard !rootPath.isEmpty else {
            return hasActiveAccess ? "Local media" : "No external folder"
        }
        return URL(fileURLWithPath: rootPath, isDirectory: true).lastPathComponent
    }

    public func grantAccess(to url: URL) {
        let folderURL = url.standardizedFileURL
        let scoped = folderURL.startAccessingSecurityScopedResource()

        do {
            #if os(macOS)
            let data = try folderURL.bookmarkData(
                options: [.withSecurityScope],
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            UserDefaults.standard.set(data, forKey: bookmarkKey)
            #endif
            UserDefaults.standard.set(folderURL.path, forKey: pathKey)
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: grantedAtKey)
            activeURL = folderURL
            rootPath = folderURL.path
            hasActiveAccess = scoped || FileManager.default.isReadableFile(atPath: folderURL.path)
            hasExplicitProtectedOriginalAccess = hasActiveAccess && !folderURL.path.isEmpty
            status = hasActiveAccess
                ? "Access granted. Originals stay here; Quipsly edits from proxies."
                : "Folder saved, but macOS did not confirm active access yet."
        } catch {
            hasActiveAccess = false
            hasExplicitProtectedOriginalAccess = false
            status = "Could not save folder access: \(error.localizedDescription)"
        }
    }

    @discardableResult
    public func restoreAccess() -> Bool {
        #if os(macOS)
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else {
            return restoreReadableRememberedPath()
        }

        do {
            var stale = false
            let url = try URL(
                resolvingBookmarkData: data,
                options: [.withSecurityScope],
                relativeTo: nil,
                bookmarkDataIsStale: &stale
            ).standardizedFileURL
            let scoped = url.startAccessingSecurityScopedResource()
            activeURL = url
            rootPath = url.path
            UserDefaults.standard.set(url.path, forKey: pathKey)
            hasActiveAccess = scoped || FileManager.default.isReadableFile(atPath: url.path)
            hasExplicitProtectedOriginalAccess = hasActiveAccess && !url.path.isEmpty
            if stale {
                status = "External folder access restored, but the bookmark is stale. Re-grant it when convenient."
            } else {
                status = hasActiveAccess
                    ? "External folder access restored. Originals stay outside the vault."
                    : "External folder remembered, but macOS has not granted active access."
            }
            return hasActiveAccess
        } catch {
            if restoreReadableRememberedPath() {
                status = "External folder bookmark could not be restored, but the remembered folder is readable in this local build."
                return true
            } else {
                hasActiveAccess = false
                hasExplicitProtectedOriginalAccess = false
                status = "External folder access needs to be granted again: \(error.localizedDescription)"
                return false
            }
        }
        #else
        hasActiveAccess = !rootPath.isEmpty
        hasExplicitProtectedOriginalAccess = hasActiveAccess
        return hasActiveAccess
        #endif
    }

    @discardableResult
    private func restoreReadableRememberedPath() -> Bool {
        let savedRootPath = UserDefaults.standard.string(forKey: pathKey) ?? rootPath
        guard !savedRootPath.isEmpty else {
            return restoreDirectFilesystemAccessIfAvailable()
        }

        let url = URL(fileURLWithPath: savedRootPath, isDirectory: true).standardizedFileURL
        activeURL = url
        rootPath = url.path
        let isManagedVault = Self.isQuipslyManagedVaultRoot(url.path)
        if Self.isProtectedUserMediaPath(url.path), !(Self.hasDirectFilesystemAccess && isManagedVault) {
            hasActiveAccess = false
            hasExplicitProtectedOriginalAccess = false
            status = "External folder remembered, but Quipsly will not probe protected folders without an active macOS folder grant. Re-grant access when you need originals."
            return false
        }

        let readable = FileManager.default.fileExists(atPath: url.path) && FileManager.default.isReadableFile(atPath: url.path)
        hasActiveAccess = readable
        hasExplicitProtectedOriginalAccess = false
        if readable, isManagedVault {
            status = "Quipsly-managed external MediaVault restored. Originals outside this vault remain protected."
        } else {
            status = readable
                ? "External folder path is readable in this local build. Originals stay outside the vault."
                : "External folder remembered, but the path is not readable right now."
        }
        return readable
    }

    @discardableResult
    private func restoreDirectFilesystemAccessIfAvailable() -> Bool {
        if Self.hasDirectFilesystemAccess {
            activeURL = nil
            rootPath = ""
            hasActiveAccess = true
            hasExplicitProtectedOriginalAccess = false
            status = "Local Quipsly Studio can read normal media paths directly. Folder grants are only needed if macOS blocks a protected location or for sandboxed release builds."
            return true
        }

        hasActiveAccess = false
        hasExplicitProtectedOriginalAccess = false
        status = "No external media folder has been granted yet."
        return false
    }

    public func clearAccess() {
        if let activeURL {
            activeURL.stopAccessingSecurityScopedResource()
        }
        activeURL = nil
        UserDefaults.standard.removeObject(forKey: bookmarkKey)
        UserDefaults.standard.removeObject(forKey: pathKey)
        UserDefaults.standard.removeObject(forKey: grantedAtKey)
        rootPath = ""
        if Self.hasDirectFilesystemAccess {
            hasActiveAccess = true
            hasExplicitProtectedOriginalAccess = false
            status = "Saved folder grant cleared. This local build still has direct access to readable media paths."
        } else {
            hasActiveAccess = false
            hasExplicitProtectedOriginalAccess = false
            status = "External media folder access cleared."
        }
    }

    public func contains(_ url: URL) -> Bool {
        guard !rootPath.isEmpty else { return false }
        let root = URL(fileURLWithPath: rootPath, isDirectory: true).standardizedFileURL.path
        let path = url.standardizedFileURL.path
        return path == root || path.hasPrefix(root + "/")
    }

    public func hasReadableAccess(to url: URL) -> Bool {
        let path = url.standardizedFileURL.path
        if Self.isProtectedUserMediaPath(path) {
            return (hasActiveAccess && isInsideManagedVault(url))
                || (hasExplicitFolderGrant && contains(url))
        }
        if hasActiveAccess && contains(url) {
            return true
        }
        return FileManager.default.fileExists(atPath: path) && FileManager.default.isReadableFile(atPath: path)
    }

    public func canProbeWithoutPrompt(_ url: URL) -> Bool {
        let path = url.standardizedFileURL.path
        if Self.isProtectedUserMediaPath(path) {
            if hasActiveAccess && isInsideManagedVault(url) {
                return true
            }
            // Important: this method is used by passive UI/readiness paths.
            // On macOS, even FileManager.fileExists/isReadableFile against Desktop,
            // Documents, Downloads, iCloud, or external volumes can trigger a TCC
            // privacy prompt. A remembered folder grant means user-initiated proxy
            // recovery may read originals; it does not make passive monitor cards,
            // waveform placeholders, or readiness badges safe to probe originals.
            return false
        }
        return true
    }

    private func isInsideManagedVault(_ url: URL) -> Bool {
        Self.isQuipslyManagedVaultRoot(rootPath) && contains(url)
    }

    public func hasUserGrantedAccess(to url: URL) -> Bool {
        let path = url.standardizedFileURL.path
        if Self.isProtectedUserMediaPath(path) {
            return hasExplicitFolderGrant && contains(url)
        }
        return true
    }

    public func fileExistsWithoutPrompt(at url: URL) -> Bool? {
        guard canProbeWithoutPrompt(url) else { return nil }
        return FileManager.default.fileExists(atPath: url.standardizedFileURL.path)
    }

    public func isReadableWithoutPrompt(at url: URL) -> Bool? {
        guard canProbeWithoutPrompt(url) else { return nil }
        return FileManager.default.isReadableFile(atPath: url.standardizedFileURL.path)
    }

    public static func isProtectedUserMediaPath(_ path: String) -> Bool {
        let home = FileManager.default.homeDirectoryForCurrentUser.standardizedFileURL.path
        let protectedPrefixes = [
            home + "/Desktop/",
            home + "/Documents/",
            home + "/Downloads/",
            home + "/Library/Mobile Documents/",
            "/Volumes/"
        ]
        return protectedPrefixes.contains { path == String($0.dropLast()) || path.hasPrefix($0) }
    }

    private static func isQuipslyManagedVaultRoot(_ path: String) -> Bool {
        guard !path.isEmpty else { return false }
        return URL(fileURLWithPath: path, isDirectory: true)
            .standardizedFileURL
            .lastPathComponent == "Quipsly Media Vault"
    }

    private static var hasDirectFilesystemAccess: Bool {
        #if os(macOS)
        return ProcessInfo.processInfo.environment["APP_SANDBOX_CONTAINER_ID"] == nil
        #else
        return true
        #endif
    }
}
