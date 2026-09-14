import Combine
import Foundation

/// Projection of the same Session work used by Nest and linked chat tasks.
struct MobileSessionWorkEntry: Decodable, Identifiable {
    let id: String
    let kind: String
    let title: String
    let body: String?
    let status: String
    let dueAt: String?
    let updatedAt: String
    let canEdit: Bool
    let visibility: String?
    let ownerLabel: String?
    let sourceHref: String?
    let ownedByCurrentActor: Bool?
    let tags: [MobileCaptureTag]?
    var sourceLink: CaptureTranscriptWorkLink? { sourceHref.flatMap { CaptureTranscriptWorkLink(href: $0) } }

    var completed: Bool { ["DONE", "ACHIEVED", "CANCELED", "CANCELLED", "ARCHIVED"].contains(status) }

    func matches(query: String, kind: String, assignedToMe: Bool) -> Bool {
        guard kind == "ALL" || self.kind == kind,
              !assignedToMe || ownedByCurrentActor == true else { return false }
        let terms = query.split(whereSeparator: { $0.isWhitespace })
        let searchable = ([title, body ?? "", ownerLabel ?? ""] + (tags ?? []).map(\.label)).joined(separator: " ")
        return terms.allSatisfy { searchable.localizedCaseInsensitiveContains(String($0)) }
    }

    func task(roomID: String, title sessionTitle: String) -> MobileCaptureTodayTask {
        MobileCaptureTodayTask(id: id, title: title, detail: body, status: status, isOverdue: nil,
            dueAt: dueAt, updatedAt: updatedAt, roomId: roomID, sessionTitle: sessionTitle,
            project: nil, canEdit: canEdit, canEditTags: false, tagIds: nil, tagLabels: nil,
            sourceAnchor: nil, lastMergedTranscriptEvidence: nil, todayReason: nil, recurrence: nil, reminder: nil)
    }

    func goal(roomID: String, title sessionTitle: String) -> MobileCaptureTodayGoal {
        MobileCaptureTodayGoal(id: id, title: title, description: body, status: status, targetAt: dueAt,
            progressPercent: nil, progressNote: nil, updatedAt: updatedAt, roomId: roomID,
            sessionTitle: sessionTitle, project: nil, canEdit: canEdit, canEditTags: false,
            tagIds: nil, tagLabels: nil, sourceAnchor: nil, lastMergedTranscriptEvidence: nil)
    }
}

struct MobileSessionWorkAssignment: Decodable {
    let engagementId: String
    let currentUserId: String
    let members: [MobileCoachingEngagementMember]
}

private struct MobileSessionWorkResponse: Decodable {
    let ok: Bool
    let error: String?
    let roomId: String?
    let actorUserId: String?
    let entries: [MobileSessionWorkEntry]?
    let entry: MobileSessionWorkEntry?
    let canCreate: Bool?
    let assignmentContext: MobileSessionWorkAssignment?
}

@MainActor
final class MobileSessionWorkClient: ObservableObject {
    @Published private(set) var entries: [MobileSessionWorkEntry] = []
    @Published private(set) var assignment: MobileSessionWorkAssignment?
    @Published private(set) var canCreate = false
    @Published private(set) var loading = false
    @Published private(set) var saving = false
    @Published private(set) var errorMessage: String?
    @Published var kind = "TASK"
    @Published var title = ""
    @Published var detail = ""
    @Published var onlyMe = false
    @Published var ownerUserID = ""
    @Published var includesDate = false
    @Published var targetDate = Date()

    private let baseURL: URL
    private var scope = ""
    private var generation = 0
    private var attempt: (fingerprint: Data, id: UUID)?
    private var accountObservation: AnyCancellable?

    init() {
        baseURL = URL(string: normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com"))!
        accountObservation = NotificationCenter.default.publisher(for: .quipslyCaptureAccountIdentityDidChange)
            .sink { [weak self] _ in Task { @MainActor in self?.reset() } }
    }

    private func reset() {
        generation += 1; scope = ""; entries = []; assignment = nil
        canCreate = false; loading = false; saving = false; errorMessage = nil
        clearDraft()
    }

    func clearDraft() {
        kind = "TASK"; title = ""; detail = ""; onlyMe = false
        ownerUserID = assignment?.currentUserId ?? ""; includesDate = false
        attempt = nil
    }

    private func currentScope(_ session: MobileCaptureSession) -> String? {
        guard let owner = AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID else { return nil }
        return "\(owner)|\(session.callRoomId)"
    }

    func load(session: MobileCaptureSession) async {
        guard let requestedScope = currentScope(session) else { reset(); return }
        if requestedScope != scope { reset(); scope = requestedScope }
        generation += 1
        let request = generation
        loading = true
        defer { if request == generation { loading = false } }
        do {
            let payload = try await requestWork(session: session)
            guard request == generation, requestedScope == scope, currentScope(session) == scope else { return }
            guard payload.roomId == session.callRoomId, payload.actorUserId != nil, let values = payload.entries else {
                throw URLError(.cannotParseResponse)
            }
            entries = values; assignment = payload.assignmentContext
            canCreate = payload.canCreate == true; errorMessage = nil
            if ownerUserID.isEmpty { ownerUserID = assignment?.currentUserId ?? "" }
        } catch {
            guard request == generation, requestedScope == scope, currentScope(session) == scope else { return }
            if [401, 403, 404].contains((error as NSError).code) { entries = []; canCreate = false; assignment = nil }
            errorMessage = error.localizedDescription
        }
    }

    func create(session: MobileCaptureSession) async -> Bool {
        guard canCreate, !saving, let ownerScope = currentScope(session), ownerScope == scope,
              !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        saving = true; errorMessage = nil
        generation += 1 // A prior poll must not replace this write's readback.
        loading = false
        defer { if ownerScope == scope { saving = false } }
        do {
            let visibility = onlyMe ? "AUTHOR_PRIVATE" : assignment == nil ? "SESSION_SHARED" : "ENGAGEMENT_SHARED"
            var content: [String: Any] = ["kind": kind, "title": title, "body": detail, "visibility": visibility,
                "targetAt": includesDate ? ISO8601DateFormatter().string(from: targetDate) as Any : NSNull()]
            if let assignment { content["ownerUserId"] = onlyMe ? assignment.currentUserId : ownerUserID }
            let fingerprint = try JSONSerialization.data(withJSONObject: content, options: [.sortedKeys])
            if attempt?.fingerprint != fingerprint { attempt = (fingerprint, UUID()) }
            content["clientRequestId"] = attempt!.id.uuidString.lowercased()
            let payload = try await requestWork(session: session, body: content)
            guard ownerScope == scope, currentScope(session) == scope else { return false }
            guard let entry = payload.entry else { throw URLError(.cannotParseResponse) }
            generation += 1
            loading = false
            entries.removeAll { $0.id == entry.id }; entries.insert(entry, at: 0)
            clearDraft()
            return true
        } catch {
            guard ownerScope == scope, currentScope(session) == scope else { return false }
            if [401, 403, 404].contains((error as NSError).code) { entries = []; canCreate = false; assignment = nil }
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func requestWork(session: MobileCaptureSession, body: [String: Any]? = nil) async throws -> MobileSessionWorkResponse {
        guard session.callRoomId.range(of: #"^[A-Za-z0-9][A-Za-z0-9_-]{0,239}$"#, options: .regularExpression) != nil else { throw URLError(.badURL) }
        let endpoint = baseURL.appendingPathComponent("api/sessions").appendingPathComponent(session.callRoomId).appendingPathComponent("work")
        var request = URLRequest(url: endpoint)
        request.timeoutInterval = 20; request.cachePolicy = .reloadIgnoringLocalCacheData
        if let body {
            request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await AuthManager.shared.authenticatedData(for: request, allowOfflineRecovery: true,
            transitionToOfflineOnNetworkFailure: false)
        guard response.url?.scheme == baseURL.scheme, response.url?.host == baseURL.host,
              response.url?.port == baseURL.port, response.url?.user == nil, response.url?.password == nil else { throw URLError(.badServerResponse) }
        let payload = try AuthResponseDecoder.decode(MobileSessionWorkResponse.self, from: data, response: response,
            errorDomain: "QuipslyCapture.SessionWork", malformedResponseMessage: "Tasks couldn’t load. Your draft is still here; try again.").payload
        guard (200...299).contains(response.statusCode), payload.ok else {
            throw NSError(domain: "QuipslyCapture.SessionWork", code: response.statusCode,
                userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Your work couldn’t save. Try again."])
        }
        return payload
    }
}
