import CryptoKit
import Foundation

enum CaptureTranscriptWorkKind: String, Codable, CaseIterable {
    case note, task, goal
}

/// Unsent work and its retry identity, not another copy of canonical work.
struct CaptureTranscriptWorkDraft: Codable, Equatable {
    var title = ""
    var body = ""
    var noteKind = "SESSION_NOTE"
    var visibility = "AUTHOR_PRIVATE"
    var hasStarted = false
    var requestID = "capture-transcript-work-\(UUID().uuidString)"

    mutating func start(title: String, body: String) {
        guard !hasStarted else { return }
        self.title = title
        self.body = body
        hasStarted = true
    }
}

struct CaptureTranscriptWorkDrafts: Codable, Equatable {
    var note = CaptureTranscriptWorkDraft()
    var task = CaptureTranscriptWorkDraft()
    var goal = CaptureTranscriptWorkDraft()

    subscript(kind: CaptureTranscriptWorkKind) -> CaptureTranscriptWorkDraft {
        get {
            switch kind { case .note: note; case .task: task; case .goal: goal }
        }
        set {
            switch kind { case .note: note = newValue; case .task: task = newValue; case .goal: goal = newValue }
        }
    }

    /// A response to an older submission cannot erase writing changed meanwhile.
    mutating func acknowledge(_ submitted: CaptureTranscriptWorkDraft, kind: CaptureTranscriptWorkKind) {
        guard self[kind] == submitted else { return }
        self[kind] = CaptureTranscriptWorkDraft()
    }
}

struct CaptureTranscriptWorkDraftScope: Codable, Equatable {
    let ownerAccountID: String
    let origin: String
    let roomID: String
    let segmentID: String
    let providerTextSha256: String
}

struct CaptureTranscriptWorkDraftStore {
    private struct Record: Codable {
        let scope: CaptureTranscriptWorkDraftScope
        let drafts: CaptureTranscriptWorkDrafts
    }
    let directory: URL

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("QuipslyCapture/TranscriptWorkDrafts", isDirectory: true)
    }

    func load(_ scope: CaptureTranscriptWorkDraftScope) throws -> CaptureTranscriptWorkDrafts {
        let url = try fileURL(scope)
        guard FileManager.default.fileExists(atPath: url.path) else { return CaptureTranscriptWorkDrafts() }
        let record = try JSONDecoder().decode(Record.self, from: Data(contentsOf: url))
        guard record.scope == scope else { throw CocoaError(.fileReadCorruptFile) }
        return record.drafts
    }

    func save(_ drafts: CaptureTranscriptWorkDrafts, for scope: CaptureTranscriptWorkDraftScope) throws {
        let url = try fileURL(scope)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var protectedDirectory = directory
        try protectedDirectory.setResourceValues(values)
        let data = try JSONEncoder().encode(Record(scope: scope, drafts: drafts))
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: directory.path)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: url, options: .atomic)
        #endif
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    private func fileURL(_ scope: CaptureTranscriptWorkDraftScope) throws -> URL {
        guard [scope.ownerAccountID, scope.origin, scope.roomID, scope.segmentID, scope.providerTextSha256]
            .allSatisfy({ !$0.isEmpty }) else { throw CocoaError(.fileWriteInvalidFileName) }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let digest = SHA256.hash(data: try encoder.encode(scope)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent("\(digest).json")
    }
}
