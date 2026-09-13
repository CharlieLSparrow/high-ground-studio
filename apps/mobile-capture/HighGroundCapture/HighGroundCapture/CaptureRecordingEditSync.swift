import Combine
import CryptoKit
import Foundation

struct CaptureRecordingEditDraft: Codable, Equatable, Sendable {
    let selected: [String]
    let startSeconds: Double
    let endSeconds: Double
    let title: String
    let outputMediaKind: String
    let primaryVideoSourceId: String
    let excludedTranscriptKeys: [String]
    let editing: Bool
    let baseOutputId: String?
    let baseOutputRevision: Int?

    // Web and native use explicit null for the absence of a rendered preview.
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(selected, forKey: .selected)
        try values.encode(startSeconds, forKey: .startSeconds)
        try values.encode(endSeconds, forKey: .endSeconds)
        try values.encode(title, forKey: .title)
        try values.encode(outputMediaKind, forKey: .outputMediaKind)
        try values.encode(primaryVideoSourceId, forKey: .primaryVideoSourceId)
        try values.encode(excludedTranscriptKeys, forKey: .excludedTranscriptKeys)
        try values.encode(editing, forKey: .editing)
        try values.encode(baseOutputId, forKey: .baseOutputId)
        try values.encode(baseOutputRevision, forKey: .baseOutputRevision)
    }
}

struct CaptureRecordingEditVersion: Codable, Sendable {
    let revision: Int
    let state: CaptureRecordingEditDraft
    let updatedAt: String
}

private struct CaptureRecordingEditResponse: Decodable {
    let ok: Bool
    let actorUserId: String?
    let edit: CaptureRecordingEditVersion?
    let code: String?
    let error: String?
    let currentRevision: Int?
}

private struct CaptureRecordingEditRequest: Codable {
    let actorUserId: String
    let expectedRevision: Int
    let clientRequestId: String
    let state: CaptureRecordingEditDraft
}

private struct CaptureRecordingEditLocal: Codable {
    let ownerScope: String
    let roomID: String
    let takeID: String
    let actorUserID: String
    var revision: Int
    var state: CaptureRecordingEditDraft?
    var pending: CaptureRecordingEditDraft?
    var request: CaptureRecordingEditRequest?
}

/// The server owns the shared draft version; this protected device copy keeps
/// unsent work and uncertain request identities across navigation and relaunch.
@MainActor
final class CaptureRecordingEditSync: ObservableObject {
    typealias Sender = @MainActor (URLRequest, String) async throws -> (Data, HTTPURLResponse)
    @Published private(set) var state: CaptureRecordingEditDraft?
    @Published private(set) var loadedTakeID: String?
    @Published private(set) var status = "Edits saved"
    @Published private(set) var error: String?
    @Published private(set) var conflictRevision: Int?
    @Published private(set) var needsRetry = false
    @Published private(set) var history = CaptureRecordingEditHistory()
    var canUndo: Bool { loadedTakeID != nil && owner() == local?.ownerScope && history.canUndo }
    var canRedo: Bool { loadedTakeID != nil && owner() == local?.ownerScope && history.canRedo }
    private let baseURL: URL
    private let directory: URL
    private let send: Sender
    private let owner: @MainActor () -> String?
    private var local: CaptureRecordingEditLocal?
    private var debounce: Task<Void, Never>?
    private var saving: Task<Void, Never>?
    private var generation = 0
    private var deviceSaveFailed = false

    init(baseURL: URL, directory: URL? = nil, owner: @escaping @MainActor () -> String?, send: @escaping Sender) {
        self.baseURL = baseURL
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("QuipslyCapture/RecordingEdits", isDirectory: true)
        self.owner = owner
        self.send = send
    }

    func load(roomID: String, takeID: String, reload: Bool = false) async {
        guard reload || local?.roomID != roomID || loadedTakeID != takeID || local?.ownerScope != owner() else { return }
        await flush()
        generation += 1
        let requestGeneration = generation
        loadedTakeID = nil
        state = nil
        history = CaptureRecordingEditHistory()
        error = nil
        conflictRevision = nil
        needsRetry = false
        guard let ownerScope = owner(), !ownerScope.isEmpty else { status = "Sign in to resume your edit"; return }
        status = "Loading saved edit…"
        do {
            var request = URLRequest(url: endpoint(roomID: roomID, takeID: takeID))
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 20
            let (data, response) = try await send(request, ownerScope)
            guard requestGeneration == generation, owner() == ownerScope else { return }
            let result = try JSONDecoder().decode(CaptureRecordingEditResponse.self, from: data)
            guard response.statusCode < 400, result.ok, let actorID = result.actorUserId else {
                throw NSError(domain: "Quipsly.RecordingEdit", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: result.error ?? "Your saved edit could not load."])
            }
            let retained = reload ? nil : readLocal(ownerScope: ownerScope, roomID: roomID, takeID: takeID)
            if let retained, retained.actorUserID == actorID, retained.pending != nil || retained.request != nil {
                local = retained
            } else {
                local = CaptureRecordingEditLocal(ownerScope: ownerScope, roomID: roomID, takeID: takeID, actorUserID: actorID,
                    revision: result.edit?.revision ?? 0, state: result.edit?.state, pending: nil, request: nil)
            }
            state = local?.state
            history = CaptureRecordingEditHistory(state)
            loadedTakeID = takeID
            status = "Edits saved"
            persist()
            if local?.pending != nil || local?.request != nil { await flush() }
        } catch {
            guard requestGeneration == generation, owner() == ownerScope else { return }
            self.error = error.localizedDescription
            status = "Edit sync unavailable"
        }
    }

    func update(_ draft: CaptureRecordingEditDraft) {
        guard loadedTakeID != nil, owner() == local?.ownerScope else { return }
        history.record(draft)
        queue(draft)
    }

    func undo() -> CaptureRecordingEditDraft? {
        guard canUndo, let draft = history.undo() else { return nil }
        queue(draft)
        return draft
    }

    func redo() -> CaptureRecordingEditDraft? {
        guard canRedo, let draft = history.redo() else { return nil }
        queue(draft)
        return draft
    }

    private func queue(_ draft: CaptureRecordingEditDraft) {
        guard var current = local, loadedTakeID == current.takeID, owner() == current.ownerScope, current.state != draft else { return }
        current.state = draft
        current.pending = draft
        local = current
        state = draft
        persist()
        guard conflictRevision == nil else { return }
        status = "Saving edits…"
        debounce?.cancel()
        debounce = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
            await self?.flush()
        }
    }

    func flush() async {
        debounce?.cancel()
        debounce = nil
        if let saving { await saving.value; return }
        guard loadedTakeID != nil else { return }
        guard conflictRevision == nil else { return }
        let task = Task { await drain() }
        saving = task
        await task.value
        saving = nil
    }

    func keepThisEdit() async {
        guard let revision = conflictRevision, var current = local, let draft = current.state else { return }
        current.revision = revision
        current.request = nil
        current.pending = draft
        local = current
        conflictRevision = nil
        persist()
        await flush()
    }

    private func drain() async {
        while var current = local, current.pending != nil || current.request != nil {
            guard owner() == current.ownerScope else { error = "Your account changed. Reopen the editor to continue."; return }
            if current.request == nil, let pending = current.pending {
                current.request = CaptureRecordingEditRequest(actorUserId: current.actorUserID, expectedRevision: current.revision,
                    clientRequestId: UUID().uuidString.lowercased(), state: pending)
                current.pending = nil
                local = current
                persist()
            }
            guard let attempt = current.request else { return }
            status = "Saving edits…"
            error = nil
            needsRetry = false
            do {
                var request = URLRequest(url: endpoint(roomID: current.roomID, takeID: current.takeID))
                request.httpMethod = "PUT"
                request.timeoutInterval = 20
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONEncoder().encode(attempt)
                let (data, response) = try await send(request, current.ownerScope)
                guard owner() == current.ownerScope else { return }
                let result = try JSONDecoder().decode(CaptureRecordingEditResponse.self, from: data)
                guard response.statusCode < 400, result.ok, result.actorUserId == current.actorUserID, let edit = result.edit else {
                    if result.code == "RECORDING_EDIT_CONFLICT" { conflictRevision = result.currentRevision }
                    if (400..<500).contains(response.statusCode), response.statusCode != 409 {
                        if var latest = local {
                            latest.pending = latest.pending ?? attempt.state
                            latest.request = nil
                            local = latest
                        }
                        persist()
                    }
                    throw NSError(domain: "Quipsly.RecordingEdit", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: result.error ?? "Your edit could not sync."])
                }
                local?.revision = edit.revision
                local?.request = nil
                if local?.pending == attempt.state { local?.pending = nil }
                persist()
            } catch {
                self.error = error.localizedDescription
                status = deviceSaveFailed ? "Edits not synced" : "Edits saved on this device"
                needsRetry = conflictRevision == nil
                return
            }
        }
        status = "Edits saved"
    }

    private func endpoint(roomID: String, takeID: String) -> URL {
        var url = baseURL.appendingPathComponent("api/sessions").appendingPathComponent(roomID).appendingPathComponent("recording-edit")
        url.append(queryItems: [URLQueryItem(name: "takeId", value: takeID)])
        return url
    }
    private func file(ownerScope: String, roomID: String, takeID: String) -> URL {
        let hash = SHA256.hash(data: Data("\(ownerScope)|\(roomID)|\(takeID)".utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent("\(hash).json")
    }
    private func readLocal(ownerScope: String, roomID: String, takeID: String) -> CaptureRecordingEditLocal? {
        guard let data = try? Data(contentsOf: file(ownerScope: ownerScope, roomID: roomID, takeID: takeID)),
              let value = try? JSONDecoder().decode(CaptureRecordingEditLocal.self, from: data),
              value.ownerScope == ownerScope, value.roomID == roomID, value.takeID == takeID else { return nil }
        return value
    }
    private func persist() {
        guard let local else { return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var directory = directory
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try directory.setResourceValues(values)
            let url = file(ownerScope: local.ownerScope, roomID: local.roomID, takeID: local.takeID)
            try JSONEncoder().encode(local).write(to: url, options: .atomic)
            #if os(iOS)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
            #endif
            deviceSaveFailed = false
        } catch {
            deviceSaveFailed = true
            self.error = "The edit could not be saved on this device: \(error.localizedDescription)"
        }
    }
}
