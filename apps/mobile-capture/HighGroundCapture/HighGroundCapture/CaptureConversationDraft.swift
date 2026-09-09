import CryptoKit
import Foundation

/// Unsent text and one explicit send attempt, not another message database.
struct CaptureConversationDraft: Codable, Equatable {
    struct PendingSend: Codable, Equatable {
        let id: UUID
        let body: String
        let schedulingEvidence: String
    }

    var body = ""
    private(set) var pending: PendingSend?

    mutating func prepareSend(body: String, schedulingEvidence: String) -> PendingSend {
        let normalized = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if let pending, pending.body == normalized, pending.schedulingEvidence == schedulingEvidence {
            return pending
        }
        let send = PendingSend(id: UUID(), body: normalized, schedulingEvidence: schedulingEvidence)
        pending = send
        return send
    }

    mutating func acknowledge(_ send: PendingSend) {
        guard pending == send else { return }
        pending = nil
        // The composer remains usable during a request. Never erase the next
        // thought just because an earlier message finished sending.
        if body.trimmingCharacters(in: .whitespacesAndNewlines) == send.body { body = "" }
    }
}

struct CaptureConversationDraftKey: Codable, Equatable {
    let ownerAccountID: String
    let origin: String
    let context: String
}

struct CaptureConversationDraftStore {
    private struct Record: Codable {
        let key: CaptureConversationDraftKey
        let draft: CaptureConversationDraft
    }
    let directory: URL

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("QuipslyCapture/ConversationDrafts", isDirectory: true)
    }

    func load(_ key: CaptureConversationDraftKey) throws -> CaptureConversationDraft {
        let url = try fileURL(key)
        guard FileManager.default.fileExists(atPath: url.path) else { return CaptureConversationDraft() }
        let record = try JSONDecoder().decode(Record.self, from: Data(contentsOf: url))
        guard record.key == key else { throw CocoaError(.fileReadCorruptFile) }
        return record.draft
    }

    func save(_ draft: CaptureConversationDraft, for key: CaptureConversationDraftKey) throws {
        let url = try fileURL(key)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var protectedDirectory = directory
        try protectedDirectory.setResourceValues(values)
        let data = try JSONEncoder().encode(Record(key: key, draft: draft))
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    private func fileURL(_ key: CaptureConversationDraftKey) throws -> URL {
        guard !key.ownerAccountID.isEmpty, !key.origin.isEmpty, !key.context.isEmpty else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let digest = SHA256.hash(data: try encoder.encode(key)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent("\(digest).json")
    }
}
