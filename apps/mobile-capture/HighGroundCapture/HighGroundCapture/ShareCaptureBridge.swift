import Foundation

enum ShareCaptureBridge {
    nonisolated static let appGroupIdentifier = "group.com.highgroundodyssey.HighGroundCapture"
    nonisolated static let ownerDefaultsKey = "quipsly.capture.share.owner-account-id"
    nonisolated static let inboxDirectoryName = "ShareCaptureInbox"

    nonisolated static func publishOwner(_ ownerAccountID: String?) {
        guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return }
        let normalized = ownerAccountID?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let normalized, !normalized.isEmpty, normalized.count <= 256 {
            defaults.set(normalized, forKey: ownerDefaultsKey)
        } else {
            defaults.removeObject(forKey: ownerDefaultsKey)
        }
    }

    static func sharedInboxDirectory(fileManager: FileManager = .default) -> URL? {
        fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(inboxDirectoryName, isDirectory: true)
    }
}

struct SharedSourceCaptureEnvelope: Codable {
    let schema: String
    let id: UUID
    let ownerAccountID: String
    let title: String?
    let body: String
    let sourceURL: String?
    let capturedAt: Date
    let sourceApplication: String?
}
